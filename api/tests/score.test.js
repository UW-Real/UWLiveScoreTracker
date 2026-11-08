const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { buildScoreResponse, handleScore, scoreRequestDiagnostics } = require("../score");
const { observation } = require("./fixtures");

const now = new Date("2026-11-07T20:16:00Z");

test("active game takes precedence; API exposes public fields and current freshness", () => {
  const active = observation({ state: "in" });
  const result = buildScoreResponse(active, observation({ completed: true }), null, now);
  assert.equal(result.game.eventId, active.event_id);
  assert.equal(result.game.state, "in");
  assert.equal(result.game.opponent.name, active.opponent_name);
  assert.equal(result.stale, false);
  assert.equal("next_poll_at" in result.game, false);
  assert.equal(buildScoreResponse(active, null, null, new Date(now.getTime() + 1)).stale, true);
});

test("latest final and upcoming game are independent, and idle finals do not become stale", () => {
  const final = observation({ completed: true, state: "post" });
  const next = observation({ event_id: "999", kickoff: "2026-11-14T20:00:00Z" });
  const result = buildScoreResponse(null, final, next, now);
  assert.equal(result.game.eventId, final.event_id);
  assert.equal(result.nextGame.eventId, "999");
  assert.equal(result.stale, false);
});

test("pregame freshness is tracked near kickoff, with TBD excluded", () => {
  const next = observation();
  assert.equal(buildScoreResponse(null, null, next, new Date(now.getTime() + 1)).stale, true);
  next.start_time_tbd = true;
  assert.equal(buildScoreResponse(null, null, next, new Date(now.getTime() + 1)).stale, false);
});

function fakeSupabase(rows, count = 0, error = null) {
  let index = 0;
  return { from() {
    const data = rows[index++] || null;
    return { select() { return this; }, eq() { return this; }, not() { return this; },
      order() { return this; }, limit() { return this; },
      maybeSingle: async () => ({ data, error }),
      then(resolve, reject) { return Promise.resolve({ count, error }).then(resolve, reject); } };
  } };
}

function response() {
  return { statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
}

test("route returns 503 before first collection and prevents HTTP caching", async () => {
  const res = response();
  await handleScore({ supabase: fakeSupabase([]) }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.stale, true);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("route reads stored results without contacting ESPN", async () => {
  const res = response();
  await handleScore({ supabase: fakeSupabase([null, observation({ completed: true }), null]) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.game.eventId, "401858516");
});

test("a collected season containing only stopped games is not treated as uninitialized", async () => {
  const res = response();
  await handleScore({ supabase: fakeSupabase([], 1) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.game, null);
});

test("database errors return a controlled 503 without leaking DB details", async () => {
  const res = response();
  await handleScore({ supabase: fakeSupabase([], 0, { message: "private details" }) }, res);
  assert.equal(res.statusCode, 503);
  assert.ok(!JSON.stringify(res.body).includes("private details"));
});

test("development requests get a correlatable log without authorization headers", (t) => {
  const oldEnv = process.env.NODE_ENV;
  const oldLog = console.info;
  t.after(() => {
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
    console.info = oldLog;
  });
  const logs = [];
  process.env.NODE_ENV = "development";
  console.info = (entry) => logs.push(JSON.parse(entry));
  const res = Object.assign(new EventEmitter(), response());
  let nextCalled = false;
  scoreRequestDiagnostics({ method: "GET", headers: { authorization: "Bearer private-token" } }, res,
    () => { nextCalled = true; });
  res.emit("finish");
  assert.equal(nextCalled, true);
  assert.equal(logs[0].event, "football_score_api_request");
  assert.equal(logs[0].requestId, res.headers["X-Score-Request-Id"]);
  assert.equal(logs[0].status, 200);
  assert.ok(logs[0].durationMs >= 0);
  assert.ok(!JSON.stringify(logs).includes("private-token"));
});

test("production requests do not get development logs or diagnostic headers", (t) => {
  const oldEnv = process.env.NODE_ENV;
  t.after(() => {
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
  });
  process.env.NODE_ENV = "production";
  const res = Object.assign(new EventEmitter(), response());
  scoreRequestDiagnostics({ method: "GET" }, res, () => {});
  assert.equal(res.headers["X-Score-Request-Id"], undefined);
  assert.equal(res.listenerCount("finish"), 0);
});

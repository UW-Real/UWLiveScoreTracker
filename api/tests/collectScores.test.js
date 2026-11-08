const test = require("node:test");
const assert = require("node:assert/strict");
const { createCollector, retryDelay, DISCOVERY_MS } = require("../collectScores");
const { FeedError } = require("../footballProvider");
const { createFootballStore } = require("../footballStore");
const { observation } = require("./fixtures");

function setup() {
  let time = Date.parse("2026-11-07T20:15:00Z");
  const logs = [], records = [], calls = [];
  const game = observation();
  const store = { record: async (...args) => records.push(args), dueGames: async () => [game] };
  const provider = {
    discover: async () => { calls.push("discover"); return [game]; },
    getGame: async () => { calls.push("detail"); return game; },
  };
  const options = { store, provider, now: () => new Date(time), log: (entry) => logs.push(entry) };
  return { options, logs, records, calls, advance: (ms) => { time += ms; } };
}

test("collector discovers hourly and collects without any browser or web server", async () => {
  const s = setup();
  const collector = createCollector(s.options);
  await collector.runOnce();
  assert.deepEqual(s.calls, ["discover", "detail"]);
  assert.equal(s.records[0][1], true);
  assert.equal(s.records[1][1], undefined);
  s.advance(15_000);
  await collector.runOnce();
  assert.deepEqual(s.calls, ["discover", "detail", "detail"]);
  s.advance(DISCOVERY_MS);
  await collector.runOnce();
  assert.equal(s.calls.filter((call) => call === "discover").length, 2);
});

test("per-game failures back off and retain the last successful stored observation", async () => {
  const s = setup();
  const collector = createCollector(s.options);
  await collector.runOnce();
  s.options.provider.getGame = async () => { s.calls.push("failure"); throw new Error("offline"); };
  s.advance(15_000);
  await collector.runOnce();
  assert.equal(s.records.length, 2);
  await collector.runOnce();
  assert.equal(s.calls.filter((call) => call === "failure").length, 1);
  s.advance(15_000);
  await collector.runOnce();
  assert.equal(s.logs.at(-1).retryInMs, 30_000);
});

test("rate limiting pauses all provider requests and honors long Retry-After", async () => {
  const s = setup();
  s.options.provider.discover = async () => { s.calls.push("limited");
    throw new FeedError("throttled", { status: 429, retryAfterMs: 600_000 }); };
  const collector = createCollector(s.options);
  await collector.runOnce();
  s.advance(300_000);
  await collector.runOnce();
  assert.deepEqual(s.calls, ["limited"]);
  assert.equal(s.logs[0].retryInMs, 600_000);
});

test("failed discovery still permits known games to be collected", async () => {
  const s = setup();
  s.options.provider.discover = async () => { throw new Error("bad schedule"); };
  await createCollector(s.options).runOnce();
  assert.deepEqual(s.calls, ["detail"]);
});

test("a restarted collector reads due games from persistent storage", async () => {
  const s = setup();
  await createCollector(s.options).runOnce();
  s.advance(15_000);
  await createCollector(s.options).runOnce();
  assert.equal(s.calls.filter((call) => call === "detail").length, 2);
});

test("worker loop stops cleanly on abort after collecting a game", async () => {
  const s = setup();
  const controller = new AbortController();
  s.options.store.record = async (game, scheduleOnly) => {
    s.records.push(game);
    if (!scheduleOnly) controller.abort();
  };
  await createCollector(s.options).run(controller.signal);
  assert.equal(s.records.length, 2);
});

test("exponential backoff caps at five minutes", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 20].map((attempt) => retryDelay(attempt)),
    [15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
});

test("database adapter propagates ingestion and scheduling errors", async () => {
  const store = createFootballStore({
    rpc: async () => ({ error: { message: "write failed" } }),
    from: () => ({ select() { return this; }, lte() { return this; },
      order: async () => ({ error: { message: "read failed" } }) }),
  });
  await assert.rejects(store.record(observation()), /write failed/);
  await assert.rejects(store.dueGames(new Date()), /read failed/);
});

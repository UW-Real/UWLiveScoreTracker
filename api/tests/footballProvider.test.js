const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: sleep } = require("node:timers/promises");
const {
  scoreValue, normalizeGame, retryAfterMilliseconds, seasonsToDiscover, createFootballProvider,
} = require("../footballProvider");
const { espnEvent } = require("./fixtures");

const now = () => new Date("2026-11-07T20:15:00Z");
const normalize = (event) => normalizeGame(event, { season: 2026, observedAt: now().toISOString() });

test("score strings, objects, zero and missing scores normalize consistently", () => {
  for (const value of [0, "0", { value: 0 }, { value: "0" }]) assert.equal(scoreValue(value), 0);
  for (const value of [undefined, null, "", {}]) assert.equal(scoreValue(value), null);
  for (const value of [-1, "NaN", " ", true, 1.5, { value: -1 }]) assert.throws(() => scoreValue(value));
});

test("UW identification does not depend on competitor order or home/away", () => {
  const event = espnEvent();
  const c = event.competitions[0];
  c.competitors[1].score = { value: 21 };
  c.competitors[0].score = "14";
  c.competitors[1].homeAway = "away";
  c.competitors.reverse();
  const game = normalize(event);
  assert.equal(game.uw_score, 21);
  assert.equal(game.opponent_score, 14);
  assert.equal(game.opponent_id, "213");
  assert.equal(game.home_away, "away");
});

test("scheduled missing scores stay null and TBD is preserved", () => {
  const event = espnEvent();
  event.competitions[0].timeValid = false;
  const game = normalize(event);
  assert.equal(game.uw_score, null);
  assert.equal(game.start_time_tbd, true);
});

test("live overtime, halftime, delays and cancellations retain detailed status", () => {
  for (const status of ["STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_DELAYED", "STATUS_CANCELED", "STATUS_POSTPONED"]) {
    const event = espnEvent();
    const c = event.competitions[0];
    c.status.type.name = status;
    c.status.type.state = status === "STATUS_CANCELED" ? "post" : "in";
    c.status.period = 5;
    c.competitors.forEach((team) => { team.score = "21"; });
    const game = normalize(event);
    assert.equal(game.status, status);
    assert.equal(game.period, 5);
    assert.equal(game.completed, false);
  }
});

test("incomplete data and absent live scores are rejected", () => {
  assert.throws(() => normalize({}));
  const event = espnEvent();
  event.competitions[0].status.type.state = "in";
  assert.throws(() => normalize(event), /Missing score/);
  event.competitions[0].competitors.pop();
  assert.throws(() => normalize(event), /Incomplete/);
});

test("season discovery follows Pacific dates and includes last season in Jan/Feb", () => {
  assert.deepEqual(seasonsToDiscover(new Date("2027-01-01T04:00Z")), [2026]);
  assert.deepEqual(seasonsToDiscover(new Date("2027-01-02T04:00Z")), [2026, 2027]);
  assert.deepEqual(seasonsToDiscover(new Date("2027-03-02T04:00Z")), [2027]);
});

test("discovery requests both season types and ignores misleading season metadata", async () => {
  const calls = [];
  const provider = createFootballProvider({ now, fetchImpl: async (url) => {
    calls.push(url);
    return Response.json({ season: { year: 2030 }, events: [espnEvent()] });
  } });
  const games = await provider.discover();
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes("season=2026&seasontype=2"));
  assert.ok(calls[1].includes("seasontype=3"));
  assert.equal(games.length, 1);
  assert.equal(games[0].season, 2026);
});

test("empty schedules are valid; absent event arrays are invalid", async () => {
  const empty = createFootballProvider({ now, fetchImpl: async () => Response.json({ events: [] }) });
  assert.deepEqual(await empty.discover(), []);
  const malformed = createFootballProvider({ now, fetchImpl: async () => Response.json({}) });
  await assert.rejects(malformed.discover(), /events array/);
});

test("an unpublished season falling back to last year's events cannot relabel games", async () => {
  const bowl = espnEvent();
  bowl.id = "401551788";
  bowl.date = bowl.competitions[0].date = "2027-01-02T02:00:00Z";
  const provider = createFootballProvider({ now: () => new Date("2027-01-15T12:00Z"),
    fetchImpl: async () => Response.json({ events: [espnEvent(), bowl] }),
  });
  const games = await provider.discover();
  assert.equal(games.length, 2);
  assert.ok(games.every((game) => game.season === 2026));
});

test("January postseason events belong to the requested previous season", async () => {
  const event = espnEvent();
  event.date = event.competitions[0].date = "2027-01-02T02:00:00Z";
  const provider = createFootballProvider({ now,
    fetchImpl: async (url) => Response.json({ events: url.includes("seasontype=3") ? [event] : [] }),
  });
  assert.equal((await provider.discover())[0].season, 2026);
});

test("summary validates event ID and preserves the known season and TBD flag", async () => {
  const event = espnEvent();
  delete event.competitions[0].timeValid;
  const provider = createFootballProvider({ now, fetchImpl: async () => Response.json({ header: event }) });
  const game = await provider.getGame({ event_id: event.id, season: 2023, start_time_tbd: true });
  assert.equal(game.season, 2023);
  assert.equal(game.start_time_tbd, true);
  await assert.rejects(provider.getGame({ event_id: "123", season: 2026 }), /wrong game/);
  await assert.rejects(provider.getGame({ event_id: "bad", season: 2026 }), /Invalid ESPN event ID/);
});

test("HTTP errors retain Retry-After (seconds and HTTP date)", async () => {
  assert.equal(retryAfterMilliseconds("12"), 12_000);
  assert.equal(retryAfterMilliseconds("invalid"), 0);
  assert.equal(retryAfterMilliseconds("Sat, 07 Nov 2026 20:16:00 GMT", now().getTime()), 60_000);
  const provider = createFootballProvider({ now, fetchImpl: async () => new Response("", {
    status: 429, headers: { "Retry-After": "600" },
  }) });
  await assert.rejects(provider.discover(), (error) => error.status === 429 && error.retryAfterMs === 600_000);
});

test("timeouts and malformed JSON fail without producing observations", async () => {
  const provider = createFootballProvider({ now, timeoutMs: 5, fetchImpl: async (url, { signal }) => {
    await sleep(1000, undefined, { signal });
    return Response.json({ events: [] });
  } });
  await assert.rejects(provider.discover(), /request failed/);
  const malformed = createFootballProvider({ now, fetchImpl: async () => new Response("not-json") });
  await assert.rejects(malformed.discover(), /invalid JSON/);
});

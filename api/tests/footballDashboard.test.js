const test = require("node:test");
const assert = require("node:assert/strict");

const helpers = import("../../src/utils/footballScores.js");
const game = {
  eventId: "123", opponent: { name: "Penn State" }, homeAway: "away",
  state: "in", status: "STATUS_IN_PROGRESS", completed: false,
  kickoff: "2026-11-07T20:30:00Z", uwScore: 0, opponentScore: 7, statusDetail: "1st Quarter",
};

test("dashboard maps real API objects into score rows without losing zero scores", async () => {
  const { footballGames } = await helpers;
  const [row] = footballGames({ game });
  assert.equal(row.id, "123");
  assert.equal(row.opponent, "Penn State");
  assert.equal(row.homeAway, "away");
  assert.equal(row.status, "live");
  assert.equal(row.uwScore, 0);
  assert.equal(row.statusDetail, "1st Quarter");
});

test("dashboard shows latest final and upcoming game, deduplicating event IDs", async () => {
  const { footballGames } = await helpers;
  const final = { ...game, completed: true, state: "post" };
  const next = { ...game, eventId: "456", state: "pre", uwScore: null, opponentScore: null };
  assert.deepEqual(footballGames({ game: final, nextGame: next }).map((row) => row.status), ["final", "upcoming"]);
  assert.equal(footballGames({ game, nextGame: game }).length, 1);
  assert.deepEqual(footballGames(null), []);
});

test("refresh is frequent during games and fifteen minutes before kickoff", async () => {
  const { scoreRefreshInterval } = await helpers;
  assert.equal(scoreRefreshInterval({ game }), 15_000);
  const next = { ...game, state: "pre" };
  assert.equal(scoreRefreshInterval({ nextGame: next }, Date.parse("2026-11-07T20:14Z")), 60_000);
  assert.equal(scoreRefreshInterval({ nextGame: next }, Date.parse("2026-11-07T20:15Z")), 15_000);
});

test("idle, TBD and stopped games use one-minute dashboard refresh", async () => {
  const { scoreRefreshInterval } = await helpers;
  for (const next of [
    { ...game, startTimeTbd: true },
    { ...game, status: "STATUS_POSTPONED" },
    { ...game, status: "STATUS_CANCELED" },
  ]) assert.equal(scoreRefreshInterval({ nextGame: next }, Date.parse("2026-11-07T21:00Z")), 60_000);
  assert.equal(scoreRefreshInterval(null), 60_000);
});

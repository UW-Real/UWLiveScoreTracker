const test = require("node:test");
const assert = require("node:assert/strict");
const { createBaseballProvider, normalizeGame } = require("../collectors/baseball/baseballProvider");
const { espnEvent } = require("./fixtures");

function baseballEvent() {
  const event = espnEvent();
  event.competitions[0].competitors[1].team.id = "133";
  return event;
}

test("baseball identifies UW by its baseball ID and preserves missing scores", () => {
  const event = baseballEvent();
  const game = normalizeGame(event, { season: 2026, observedAt: "2026-11-07T20:00:00Z" });
  assert.equal(game.opponent_id, "213");
  assert.equal(game.uw_score, null);
  event.competitions[0].competitors[1].team.id = "264";
  assert.throws(() => normalizeGame(event, { season: 2026, observedAt: "2026-11-07T20:00:00Z" }));
});

test("baseball summary falls back to schedule date and keeps inning and scores", async () => {
  const event = baseballEvent();
  delete event.date;
  delete event.competitions[0].date;
  event.competitions[0].status = { period: 10, type: { state: "in", name: "STATUS_IN_PROGRESS", completed: false, detail: "Top 10th" } };
  event.competitions[0].competitors[0].score = "4";
  event.competitions[0].competitors[1].score = "5";
  const provider = createBaseballProvider({ now: () => new Date("2026-11-07T20:30:00Z"), fetchImpl: async () => Response.json({ header: event }) });
  const game = await provider.getGame({ event_id: event.id, season: 2026, kickoff: "2026-11-07T20:30:00Z" });
  assert.equal(game.uw_score, 5);
  assert.equal(game.opponent_score, 4);
  assert.equal(game.period, 10);
  assert.equal(game.kickoff, "2026-11-07T20:30:00.000Z");
});

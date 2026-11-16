const test = require("node:test");
const assert = require("node:assert/strict");
const { createBasketballProvider, seasonsToDiscover } = require("../collectors/basketball/basketballProvider");
const { espnEvent } = require("./fixtures");

function game(date, id) {
  const event = espnEvent();
  event.id = id;
  event.date = date;
  event.competitions[0].date = date;
  return event;
}

test("basketball discovery uses the season ending year across the calendar boundary", async () => {
  const fall = game("2026-11-03T03:00:00Z", "101");
  const spring = game("2027-03-10T03:00:00Z", "102");
  const previous = game("2026-03-10T03:00:00Z", "103");
  const urls = [];
  const provider = createBasketballProvider({ league: "mens-college-basketball", now: () => new Date("2026-11-15T20:00:00Z"),
    fetchImpl: async (url) => { urls.push(url); return Response.json({ events: [fall, spring, previous] }); } });
  const games = await provider.discover();
  assert.deepEqual(games.map(({ event_id, season }) => [event_id, season]).sort(), [["101", 2027], ["102", 2027], ["103", 2026]]);
  assert.ok(urls.every((url) => url.includes("mens-college-basketball/teams/264/")));
  assert.deepEqual(seasonsToDiscover(new Date("2027-01-05T20:00:00Z")), [2027, 2028]);
});

test("women's basketball detail preserves the scheduled date if ESPN omits it", async () => {
  const event = game("2026-11-03T03:00:00Z", "104");
  delete event.date;
  delete event.competitions[0].date;
  const provider = createBasketballProvider({ league: "womens-college-basketball", now: () => new Date("2026-11-01T00:00:00Z"),
    fetchImpl: async (url) => { assert.ok(url.includes("womens-college-basketball")); return Response.json({ header: event }); } });
  const result = await provider.getGame({ event_id: "104", season: 2027, kickoff: "2026-11-03T03:00:00Z" });
  assert.equal(result.kickoff, "2026-11-03T03:00:00.000Z");
  assert.equal(result.opponent_id, "213");
});

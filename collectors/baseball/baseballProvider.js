const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball";
const UW_TEAM_ID = "133";

const { FeedError, retryAfterMilliseconds, scoreValue, normalizeGame: normalizeEspnGame } = require("../espnTools");

function normalizeGame(event, options = {}) {
  return normalizeEspnGame(event, { ...options, teamId: UW_TEAM_ID });
}

function seasonsToDiscover(now) {
  const [month, year] = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", month: "numeric", year: "numeric",
  }).format(now).split("/").map(Number);
  return month >= 10 || month <= 2 ? [year - 1, year, year + 1] : [year];
}

function createBaseballProvider({ fetchImpl = fetch, now = () => new Date(), timeoutMs = 10_000 } = {}) {
  async function request(path, signal) {
    try {
      // The timeout covers the response body as well as the initial headers.
      const response = await fetchImpl(`${BASE_URL}/${path}`, {
        signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new FeedError(`ESPN returned HTTP ${response.status}`, {
          status: response.status,
          retryAfterMs: retryAfterMilliseconds(response.headers.get("retry-after"), now().getTime()),
        });
      }
      return await response.json();
    } catch (error) {
      if (error instanceof FeedError) throw error;
      throw new FeedError("ESPN request failed or returned invalid JSON", { cause: error });
    }
  }

  async function discover(signal) {
    const games = new Map();
    for (const season of seasonsToDiscover(now())) {
      for (const seasonType of [2, 3]) {
        const observedAt = now().toISOString();
        const data = await request(`teams/${UW_TEAM_ID}/schedule?season=${season}&seasontype=${seasonType}`, signal);
        if (!Array.isArray(data.events)) throw new FeedError("ESPN schedule has no events array");
        for (const event of data.events) {
          // ESPN's top-level season metadata can describe the current year even
          // for historical requests. The requested season is authoritative.
          const game = normalizeGame(event, { season, observedAt });
          const kickoff = new Date(game.kickoff);
          // An unpublished season can fall back to older schedule events. Do
          // not relabel those games or overwrite the previous season's entry.
          const eventSeason = kickoff.getUTCFullYear();
          if (eventSeason !== season) continue;
          games.set(game.event_id, game);
        }
      }
    }
    return [...games.values()];
  }

  async function getGame(game, signal) {
    const observedAt = now().toISOString();
    if (!/^\d+$/.test(game.event_id)) throw new FeedError("Invalid ESPN event ID");
    const data = await request(`summary?event=${game.event_id}`, signal);
    if (String(data.header?.id) !== game.event_id) throw new FeedError("ESPN returned the wrong game");
    return normalizeGame(data.header, { season: game.season, observedAt, startTimeTbd: game.start_time_tbd, kickoffFallback: game.kickoff });
  }

  return { discover, getGame };
}

module.exports = {
  BASE_URL, UW_TEAM_ID, FeedError, retryAfterMilliseconds, scoreValue,
  normalizeGame, seasonsToDiscover, createBaseballProvider,
};

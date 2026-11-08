const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const UW_TEAM_ID = "264";

class FeedError extends Error {
  constructor(message, { status, retryAfterMs = 0, cause } = {}) {
    super(message, { cause });
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMilliseconds(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

function scoreValue(score) {
  if (score == null) return null;
  const value = typeof score === "object" ? score.value : score;
  if (value == null || value === "") return null;
  if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
    throw new FeedError("Invalid score in ESPN response");
  }
  const points = Number(value);
  if (!Number.isInteger(points) || points < 0) throw new FeedError("Invalid score in ESPN response");
  return points;
}

function normalizeGame(event, { season, observedAt, startTimeTbd = false } = {}) {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors;
  const uw = competitors?.find((entry) => String(entry.team?.id) === UW_TEAM_ID);
  const opponent = competitors?.find((entry) => String(entry.team?.id) !== UW_TEAM_ID);
  const status = competition?.status || event?.status;
  const kickoff = competition?.date || event?.date;
  const period = status?.period;

  if (!/^\d+$/.test(String(event?.id)) || !uw || !opponent?.team?.id ||
      competitors.length !== 2 || !opponent.team.displayName ||
      !["home", "away"].includes(uw.homeAway) ||
      !["pre", "in", "post"].includes(status?.type?.state) ||
      !status.type.name || typeof status.type.completed !== "boolean" ||
      !Number.isInteger(season) || !Number.isFinite(Date.parse(kickoff)) ||
      !Number.isFinite(Date.parse(observedAt)) ||
      (period != null && (!Number.isInteger(period) || period < 0))) {
    throw new FeedError("Incomplete game in ESPN response");
  }

  const uwScore = scoreValue(uw.score);
  const opponentScore = scoreValue(opponent.score);
  if ((status.type.state === "in" || status.type.completed) &&
      (uwScore === null || opponentScore === null)) {
    throw new FeedError("Missing score for an active or completed game");
  }

  return {
    event_id: String(event.id),
    season,
    kickoff: new Date(kickoff).toISOString(),
    start_time_tbd: competition.timeValid === false || /\bTBD\b/i.test(status.type.detail || "") ||
      (competition.timeValid == null && startTimeTbd),
    opponent_id: String(opponent.team.id),
    opponent_name: opponent.team.displayName,
    home_away: uw.homeAway,
    uw_score: uwScore,
    opponent_score: opponentScore,
    state: status.type.state,
    status: status.type.name,
    status_detail: status.type.detail || status.type.description || status.type.name,
    completed: status.type.completed,
    period: period ?? null,
    clock: status.displayClock ?? null,
    observed_at: new Date(observedAt).toISOString(),
  };
}

function seasonsToDiscover(now) {
  const [month, year] = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", month: "numeric", year: "numeric",
  }).format(now).split("/").map(Number);
  return month <= 2 ? [year - 1, year] : [year];
}

function createFootballProvider({ fetchImpl = fetch, now = () => new Date(), timeoutMs = 10_000 } = {}) {
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
          const eventSeason = kickoff.getUTCFullYear() - (kickoff.getUTCMonth() < 2 ? 1 : 0);
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
    return normalizeGame(data.header, { season: game.season, observedAt, startTimeTbd: game.start_time_tbd });
  }

  return { discover, getGame };
}

module.exports = {
  BASE_URL, UW_TEAM_ID, FeedError, retryAfterMilliseconds, scoreValue,
  normalizeGame, seasonsToDiscover, createFootballProvider,
};

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

function normalizeGame(event, { season, observedAt, startTimeTbd = false, kickoffFallback, teamId } = {}) {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors;
  const uw = competitors?.find((entry) => String(entry.team?.id) === String(teamId));
  const opponent = competitors?.find((entry) => String(entry.team?.id) !== String(teamId));
  const status = competition?.status || event?.status;
  const kickoff = competition?.date || event?.date || kickoffFallback;
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

module.exports = { FeedError, retryAfterMilliseconds, scoreValue, normalizeGame };

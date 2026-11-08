const express = require("express");
const { randomUUID } = require("node:crypto");
const Router = express.Router();
const STOPPED_STATUSES = ["STATUS_CANCELED", "STATUS_CANCELLED", "STATUS_POSTPONED"];
const GAME_COLUMNS = "event_id,season,kickoff,start_time_tbd,opponent_id,opponent_name,home_away,uw_score,opponent_score,state,status,status_detail,completed,period,clock,observed_at";

function publicGame(game) {
  if (!game) return null;
  return {
    eventId: game.event_id, season: game.season, kickoff: game.kickoff,
    startTimeTbd: game.start_time_tbd,
    opponent: { id: game.opponent_id, name: game.opponent_name },
    homeAway: game.home_away, uwScore: game.uw_score, opponentScore: game.opponent_score,
    state: game.state, status: game.status, statusDetail: game.status_detail,
    completed: game.completed, period: game.period, clock: game.clock, observedAt: game.observed_at,
  };
}

function buildScoreResponse(active, final, next, now = new Date()) {
  const game = active || final;
  const nextIsDue = next && !next.start_time_tbd && !STOPPED_STATUSES.includes(next.status) &&
    Date.parse(next.kickoff) - 15 * 60_000 <= now.getTime();
  const watched = active || (nextIsDue ? next : null);
  return {
    game: publicGame(game),
    nextGame: publicGame(next),
    source: "ESPN",
    fetchedAt: (active || (nextIsDue ? next : null) || final || next)?.observed_at || null,
    stale: Boolean(watched && now.getTime() - Date.parse(watched.observed_at) > 60_000),
  };
}

async function readScores(supabase) {
  const queries = [
    supabase.from("football_games").select(GAME_COLUMNS).eq("state", "in")
      .eq("completed", false).not("status", "in", `(${STOPPED_STATUSES.join(",")})`)
      .order("kickoff", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("football_games").select(GAME_COLUMNS).eq("completed", true)
      .order("kickoff", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("football_games").select(GAME_COLUMNS).eq("state", "pre")
      .eq("completed", false).not("status", "in", `(${STOPPED_STATUSES.join(",")})`)
      .order("kickoff", { ascending: true }).limit(1).maybeSingle(),
  ];
  const results = await Promise.all(queries);
  if (results.some((result) => result.error)) throw new Error("Unable to read stored football scores");
  return results.map((result) => result.data);
}

async function handleScore(req, res) {
  res.set("Cache-Control", "no-store");
  try {
    const [active, final, next] = await readScores(req.supabase);
    if (!active && !final && !next) {
      // A season with only canceled/postponed games is still collected data.
      const { count, error } = await req.supabase.from("football_games")
        .select("event_id", { count: "exact", head: true });
      if (error) throw new Error("Unable to read collection state");
      if (!count) {
        return res.status(503).json({ ...buildScoreResponse(null, null, null), stale: true,
          error: { reason: "Score collection has not succeeded yet." } });
      }
    }
    return res.json(buildScoreResponse(active, final, next));
  } catch (error) {
    console.error(JSON.stringify({ event: "football_score_read_error", error: error.message }));
    return res.status(503).json({ error: { reason: "Stored scores are temporarily unavailable." } });
  }
}

function scoreRequestDiagnostics(req, res, next) {
  if (process.env.NODE_ENV === "development") {
    const started = Date.now();
    const requestId = randomUUID();
    res.set("X-Score-Request-Id", requestId);
    res.once("finish", () => {
      console.info(JSON.stringify({
        event: "football_score_api_request", requestId, method: req.method, path: "/score",
        status: res.statusCode, durationMs: Date.now() - started, at: new Date().toISOString(),
      }));
    });
  }
  next();
}

Router.get("/", scoreRequestDiagnostics, handleScore);

module.exports = { Router, handleScore, readScores, publicGame, buildScoreResponse, scoreRequestDiagnostics };

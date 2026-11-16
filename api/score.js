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

async function readScores(supabase, table = "football_games") {
  const queries = [
    supabase.from(table).select(GAME_COLUMNS).eq("state", "in")
      .eq("completed", false).not("status", "in", `(${STOPPED_STATUSES.join(",")})`)
      .order("kickoff", { ascending: false }).limit(1).maybeSingle(),
    supabase.from(table).select(GAME_COLUMNS).eq("completed", true)
      .order("kickoff", { ascending: false }).limit(1).maybeSingle(),
    supabase.from(table).select(GAME_COLUMNS).eq("state", "pre")
      .eq("completed", false).not("status", "in", `(${STOPPED_STATUSES.join(",")})`)
      .order("kickoff", { ascending: true }).limit(1).maybeSingle(),
  ];
  const results = await Promise.all(queries);
  if (results.some((result) => result.error)) throw new Error("Unable to read stored scores");
  return results.map((result) => result.data);
}

async function readPreviousGames(supabase, table = "football_games") {
  const games = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(GAME_COLUMNS)
      .eq("completed", true).order("kickoff", { ascending: false })
      .order("event_id", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw new Error("Unable to read previous games");
    games.push(...data);
    if (data.length < pageSize) return games;
  }
}

async function handleScore(req, res, table = "football_games") {
  res.set("Cache-Control", "no-store");
  try {
    const [[active, final, next], previousGames] = await Promise.all([
      readScores(req.supabase, table),
      readPreviousGames(req.supabase, table),
    ]);
    if (!active && !final && !next) {
      // A season with only canceled/postponed games is still collected data.
      const { count, error } = await req.supabase.from(table)
        .select("event_id", { count: "exact", head: true });
      if (error) throw new Error("Unable to read collection state");
      if (!count) {
        return res.status(503).json({ ...buildScoreResponse(null, null, null), stale: true,
          error: { reason: "Score collection has not succeeded yet." } });
      }
    }
    const result = buildScoreResponse(active, final, next);
    result.previousGames = previousGames.map(publicGame);
    return res.json(result);
  } catch (error) {
    console.error(JSON.stringify({ event: "score_read_error", table, error: error.message }));
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
        event: `${({ "/score/baseball": "baseball", "/score/mens-basketball": "mens_basketball", "/score/womens-basketball": "womens_basketball" })[req.path === "/" ? "/score" : `/score${req.path}`] || "football"}_score_api_request`,
        requestId, method: req.method, path: req.originalUrl || "/score",
        status: res.statusCode, durationMs: Date.now() - started, at: new Date().toISOString(),
      }));
    });
  }
  next();
}

Router.get("/", scoreRequestDiagnostics, (req, res) => handleScore(req, res));
Router.get("/baseball", scoreRequestDiagnostics, (req, res) => handleScore(req, res, "baseball_games"));
Router.get("/mens-basketball", scoreRequestDiagnostics, (req, res) => handleScore(req, res, "mens_basketball_games"));
Router.get("/womens-basketball", scoreRequestDiagnostics, (req, res) => handleScore(req, res, "womens_basketball_games"));

module.exports = { Router, handleScore, readScores, readPreviousGames, publicGame, buildScoreResponse, scoreRequestDiagnostics };

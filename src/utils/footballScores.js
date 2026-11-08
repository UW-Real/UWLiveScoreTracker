const STOPPED_STATUSES = ["STATUS_CANCELED", "STATUS_CANCELLED", "STATUS_POSTPONED"];

function footballGames(response) {
  const games = [response?.game, response?.nextGame].filter(Boolean);
  return games.filter((game, index) => games.findIndex((entry) => entry.eventId === game.eventId) === index)
    .map((game) => ({
      id: game.eventId,
      opponent: game.opponent.name,
      kickoff: game.kickoff,
      startTimeTbd: game.startTimeTbd,
      homeAway: game.homeAway,
      status: game.completed ? "final" : game.state === "in" ? "live" : "upcoming",
      statusDetail: game.statusDetail,
      uwScore: game.uwScore,
      opponentScore: game.opponentScore,
    }));
}

function scoreRefreshInterval(response, now = Date.now()) {
  if (response?.game?.state === "in") return 15_000;
  const next = response?.nextGame;
  if (next && !next.startTimeTbd && !STOPPED_STATUSES.includes(next.status) &&
      Date.parse(next.kickoff) - 15 * 60_000 <= now) return 15_000;
  return 60_000;
}

export { footballGames, scoreRefreshInterval };

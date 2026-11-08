const STATUS_LABELS = { upcoming: "Upcoming", live: "Live", final: "Final" };

// Shared score rows use the sport-specific API adapter's display shape.
export default function ScoresSection({ sportName, games = [], emptyMessage }) {
  return (
    <section className="scores-section" aria-labelledby="scores-heading">
      <h3 id="scores-heading" className="scores-heading">Scores</h3>

      {games.length === 0 ? (
        <div className="scores-empty">
          <p className="scores-empty-title">No scores yet</p>
          <p className="scores-empty-text">
            {emptyMessage || `${sportName} scores will show up here once live scores are connected.`}
          </p>
        </div>
      ) : (
        <ul className="scores-list">
          {games.map((game) => (
            <li key={game.id} className="score-row">
              <div>
                <p className="score-opponent">{game.homeAway === "away" ? "at" : "vs."} {game.opponent}</p>
                <p className="score-date">
                  {game.kickoff ? new Date(game.kickoff).toLocaleString(undefined, {
                    dateStyle: "medium", ...(game.startTimeTbd ? {} : { timeStyle: "short" }),
                  }) : game.date}
                  {game.startTimeTbd && " · Time TBD"}
                </p>
                {game.statusDetail && <p className="score-date">{game.statusDetail}</p>}
              </div>
              <span className={`score-status ${game.status}`}>
                {STATUS_LABELS[game.status] ?? game.status}
              </span>
              <p className="score-value">
                {game.status === "upcoming"
                  ? "—"
                  : <><span className="sr-only">UW </span>{game.uwScore ?? "—"} – <span className="sr-only">opponent </span>{game.opponentScore ?? "—"}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

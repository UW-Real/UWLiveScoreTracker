const STATUS_LABELS = { upcoming: "Upcoming", live: "Live", final: "Final" };

// Shows one sport's scores. Until the score API exists, `games` is always
// empty and this renders the placeholder.
//
// Expected game shape (adjust to match the API once it's built):
// { id, opponent, date, status: "upcoming" | "live" | "final",
//   uwScore, opponentScore }
export default function ScoresSection({ sportName, games = [] }) {
  return (
    <section className="scores-section" aria-labelledby="scores-heading">
      <h3 id="scores-heading" className="scores-heading">Scores</h3>

      {games.length === 0 ? (
        <div className="scores-empty">
          <p className="scores-empty-title">No scores yet</p>
          <p className="scores-empty-text">
            {sportName} scores will show up here once live scores are connected.
          </p>
        </div>
      ) : (
        <ul className="scores-list">
          {games.map((game) => (
            <li key={game.id} className="score-row">
              <div>
                <p className="score-opponent">vs. {game.opponent}</p>
                <p className="score-date">{game.date}</p>
              </div>
              <span className={`score-status ${game.status}`}>
                {STATUS_LABELS[game.status] ?? game.status}
              </span>
              <p className="score-value">
                {game.status === "upcoming"
                  ? "—"
                  : `${game.uwScore} – ${game.opponentScore}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

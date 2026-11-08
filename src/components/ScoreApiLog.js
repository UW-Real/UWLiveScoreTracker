export default function ScoreApiLog({ entries }) {
  return (
    <details className="score-api-log" open>
      <summary>Score API · development log</summary>
      <p className="score-api-log-description">
        Browser → GET /score → stored Supabase observations. The separate collector fetches ESPN.
        Latest 10 requests; full details are also in the browser console.
      </p>
      {entries.length === 0 ? <p className="score-api-log-description">Waiting for the first response…</p> : (
        <ol className="score-api-log-entries">
          {entries.map((entry, index) => (
            <li key={`${entry.requestedAt}-${index}`}>
              <details>
                <summary>
                  <span className={entry.error ? "api-log-error" : "api-log-success"}>
                    {entry.status ?? "Network error"}
                  </span>{" "}
                  {entry.method} {entry.url} · {entry.durationMs} ms · {entry.requestedAt}
                </summary>
                <pre>{JSON.stringify(entry, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

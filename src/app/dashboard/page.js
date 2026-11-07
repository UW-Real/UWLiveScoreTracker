"use client";

import { useState } from "react";
import { getScore } from "@/api/ScoreAPI";

export default function Dashboard() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleGetScore() {
    setIsLoading(true);
    setError("");

    try {
      setResult(await getScore());
    } catch (requestError) {
      setResult(null);
      setError(requestError.message || "The score request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="dashboard">
      <a className="dashboard-home-link" href="/">← Home</a>
      <p className="eyebrow"><span aria-hidden="true" /> UW SCORE TRACKER</p>
      <h1 className="dashboard-title">Dashboard</h1>
      <p className="dashboard-description">Test the score API connection.</p>

      <button
        className="submit-button dashboard-button"
        type="button"
        onClick={handleGetScore}
        disabled={isLoading}
      >
        {isLoading ? "Loading…" : "Get score"}
      </button>

      {result !== null && (
        <pre className="dashboard-result" aria-live="polite">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      {error && <p className="form-notice error" role="alert">{error}</p>}
    </main>
  );
}

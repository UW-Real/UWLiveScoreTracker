"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getScore } from "@/api/ScoreAPI";
import { footballGames, scoreRefreshInterval } from "@/utils/footballScores";
import { SPORTS } from "@/utils/sports";
import SportTabs from "@/components/SportTabs";
import ScoreApiLog from "@/components/ScoreApiLog";

export default function LiveScoresDashboard() {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [requestLog, setRequestLog] = useState([]);
  const [lastChecked, setLastChecked] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer;

    async function refresh() {
      let interval = 60_000;
      try {
        const response = await getScore({
          signal: controller.signal,
          onDebug: (entry) => {
            if (!controller.signal.aborted) setRequestLog((previous) => [entry, ...previous].slice(0, 10));
          },
        });
        if (controller.signal.aborted) return;
        setResult(response);
        setError(null);
        setLastChecked(new Date().toISOString());
        interval = scoreRefreshInterval(response);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        const signInRequired = [401, 403].includes(requestError.response?.status);
        setError({
          signInRequired,
          message: signInRequired ? "Sign in to view live scores."
            : requestError.response?.data?.error?.reason || "Unable to refresh scores. Retrying in one minute.",
        });
      } finally {
        if (!controller.signal.aborted) {
          setPending(false);
          timer = setTimeout(() => {
            setPending(true);
            setRefreshIndex((index) => index + 1);
          }, interval);
        }
      }
    }

    refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refreshIndex]);

  function refreshNow() {
    setPending(true);
    setRefreshIndex((index) => index + 1);
  }

  return (
    <main className="page">
      <div className="scores-toolbar">
        <h1 className="page-title">Live Scores</h1>
        <button className="score-refresh-button" type="button" onClick={refreshNow} disabled={pending}>
          {pending ? "Refreshing…" : "Refresh scores"}
        </button>
      </div>
      <div className="scores-feed-status" role="status" aria-live="polite">
        {result ? (
          <>
            <span>{result.source} · Football · {scoreRefreshInterval(result) / 1000}s refresh</span>
            <span>Score observed: {result.fetchedAt ? new Date(result.fetchedAt).toLocaleString() : "Not available"}</span>
            <span>API checked: {lastChecked ? new Date(lastChecked).toLocaleTimeString() : "—"}</span>
          </>
        ) : <span>{pending ? "Loading football scores…" : "Football scores unavailable."}</span>}
      </div>
      {error && (
        <p className="form-notice error" role="alert">
          {error.message}{" "}
          {error.signInRequired && <Link className="score-sign-in" href="/login">Sign in →</Link>}
          {result && !error.signInRequired && " Showing the last successful response."}
        </p>
      )}
      {result?.stale && (
        <p className="form-notice error" role="status">The score feed is delayed. Showing the latest stored scores.</p>
      )}
      <SportTabs
        sports={SPORTS}
        scoresBySport={{ football: footballGames(result) }}
        emptyMessages={{ football: pending ? "Loading football scores…"
          : error?.message || "No current or upcoming football games are available." }}
      />
      {process.env.NODE_ENV === "development" && <ScoreApiLog entries={requestLog} />}
    </main>
  );
}

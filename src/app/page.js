"use client";

import SportTabs from "@/components/SportTabs";
import { SPORTS } from "@/utils/sports";

// Maps a sport id (see src/utils/sports.js) to its list of games. It stays
// empty until the score API exists; then fill it from a src/api/ScoreAPI.js
// call and the tabs will show the scores.
const scoresBySport = {};

export default function Home() {
  return (
    <main className="page">
      <h1 className="page-title">Live Scores</h1>
      <SportTabs sports={SPORTS} scoresBySport={scoresBySport} />
    </main>
  );
}

// Read-only: this exercises the real provider without credentials or DB writes.
const assert = require("node:assert/strict");
const { createFootballProvider } = require("./footballProvider");

async function main() {
  const provider = createFootballProvider();
  const games = await provider.discover();
  assert.ok(games.length > 0, "UW schedule must contain games");
  const active = games.find((game) => game.state === "in");
  const next = games.filter((game) => game.state === "pre").sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
  const selected = active || next || games.at(-1);
  const detail = await provider.getGame(selected);
  assert.equal(detail.event_id, selected.event_id);
  const historical = await provider.getGame({ event_id: "401551788", season: 2023 });
  assert.equal(historical.uw_score, 37);
  assert.equal(historical.opponent_score, 31);
  assert.equal(historical.completed, true);
  console.log(JSON.stringify({ event: "football_smoke_passed", games: games.length,
    selected: detail, historicalFinal: { uw: historical.uw_score, opponent: historical.opponent_score } }));
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "football_smoke_failed", error: error.message }));
  process.exitCode = 1;
});

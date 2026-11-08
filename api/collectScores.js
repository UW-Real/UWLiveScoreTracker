const { setTimeout: sleep } = require("node:timers/promises");
const { createFootballProvider } = require("./footballProvider");
const { createFootballStore } = require("./footballStore");
const { createServerSupabaseClient } = require("./supabase");

const POLL_MS = 15_000;
const DISCOVERY_MS = 60 * 60 * 1000;

function retryDelay(attempt, retryAfterMs = 0) {
  return Math.max(Math.min(POLL_MS * 2 ** Math.min(attempt - 1, 5), 300_000), retryAfterMs);
}

function createCollector({ provider, store, now = () => new Date(), log = (entry) => console.log(JSON.stringify(entry)) }) {
  let discoverAt = 0;
  let blockedUntil = 0;
  const retries = new Map();

  function failure(key, error) {
    const attempt = (retries.get(key)?.attempt || 0) + 1;
    const delay = retryDelay(attempt, error.retryAfterMs);
    retries.set(key, { attempt, at: now().getTime() + delay });
    // Retry-After applies to the provider as a whole, not just this game.
    if (error.status === 429 || error.retryAfterMs) blockedUntil = now().getTime() + delay;
    log({ event: "football_collection_error", task: key, attempt, retryInMs: delay,
      at: now().toISOString(), error: error.message });
  }

  async function runOnce(signal) {
    if (signal?.aborted || now().getTime() < blockedUntil) return;
    if (now().getTime() >= discoverAt && now().getTime() >= (retries.get("discovery")?.at || 0)) {
      try {
        const games = await provider.discover(signal);
        for (const game of games) {
          if (signal?.aborted) return;
          await store.record(game, true);
        }
        retries.delete("discovery");
        discoverAt = now().getTime() + DISCOVERY_MS;
        log({ event: "football_schedule_discovered", games: games.length, at: now().toISOString() });
      } catch (error) {
        if (signal?.aborted) return;
        failure("discovery", error);
      }
    }
    if (now().getTime() < blockedUntil) return;
    let due;
    try {
      if (now().getTime() < (retries.get("database")?.at || 0)) return;
      due = await store.dueGames(now());
      retries.delete("database");
    } catch (error) {
      failure("database", error);
      return;
    }
    for (const game of due) {
      if (signal?.aborted || now().getTime() < blockedUntil) return;
      if (now().getTime() < (retries.get(game.event_id)?.at || 0)) continue;
      try {
        const observation = await provider.getGame(game, signal);
        await store.record(observation);
        retries.delete(game.event_id);
        log({ event: "football_game_collected", eventId: game.event_id, state: observation.state,
          uwScore: observation.uw_score, opponentScore: observation.opponent_score, at: now().toISOString() });
      } catch (error) {
        if (signal?.aborted) return;
        failure(game.event_id, error);
      }
    }
  }

  async function run(signal) {
    while (!signal.aborted) {
      await runOnce(signal);
      try {
        await sleep(POLL_MS, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
  }

  return { runOnce, run };
}

async function main() {
  if (process.env.NODE_ENV !== "production") require("dotenv").config({ path: ".env.development", quiet: true });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const collector = createCollector({
    provider: createFootballProvider(),
    store: createFootballStore(createServerSupabaseClient()),
  });
  console.log(JSON.stringify({ event: "football_collector_started", at: new Date().toISOString() }));
  await collector.run(controller.signal);
  console.log(JSON.stringify({ event: "football_collector_stopped", at: new Date().toISOString() }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: "football_collector_fatal", error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { createCollector, retryDelay, POLL_MS, DISCOVERY_MS };

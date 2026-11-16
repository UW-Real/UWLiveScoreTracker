const { createCollector } = require("../football/collectScores");
const { createBasketballProvider } = require("./basketballProvider");
const { createServerSupabaseClient } = require("../../server/supabase");

function createBasketballStore(supabase, sport) {
  if (!["mens_basketball", "womens_basketball"].includes(sport)) throw new Error("Invalid basketball sport");
  return {
    async record(game, scheduleOnly = false) {
      const { error } = await supabase.rpc(`record_${sport}_observation`, { observation: game, schedule_only: scheduleOnly });
      if (error) throw new Error(`Unable to store ${sport} observation: ${error.message}`);
    },
    async dueGames(now) {
      const { data, error } = await supabase.from(`${sport}_games`).select("event_id, season, start_time_tbd, kickoff")
        .lte("next_poll_at", now.toISOString()).order("next_poll_at");
      if (error) throw new Error(`Unable to read ${sport} collection schedule: ${error.message}`);
      return data;
    },
  };
}

async function main() {
  if (process.env.NODE_ENV !== "production") require("dotenv").config({ path: ".env.development", quiet: true });
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  const supabase = createServerSupabaseClient();
  const sports = [["mens_basketball", "mens-college-basketball"], ["womens_basketball", "womens-college-basketball"]];
  const workers = sports.map(([sport, league]) => createCollector({ sport,
    provider: createBasketballProvider({ league }), store: createBasketballStore(supabase, sport) }));
  console.log(JSON.stringify({ event: "basketball_collector_started", at: new Date().toISOString() }));
  await Promise.all(workers.map((worker) => worker.run(controller.signal)));
  console.log(JSON.stringify({ event: "basketball_collector_stopped", at: new Date().toISOString() }));
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ event: "basketball_collector_fatal", error: error.message }));
  process.exitCode = 1;
});
module.exports = { createBasketballStore };

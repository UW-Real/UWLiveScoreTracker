const { createCollector } = require("../football/collectScores");
const { createBaseballProvider } = require("./baseballProvider");
const { createBaseballStore } = require("./baseballStore");
const { createServerSupabaseClient } = require("../../server/supabase");

async function main() {
  if (process.env.NODE_ENV !== "production") require("dotenv").config({ path: ".env.development", quiet: true });
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  const collector = createCollector({ sport: "baseball", provider: createBaseballProvider(),
    store: createBaseballStore(createServerSupabaseClient()) });
  console.log(JSON.stringify({ event: "baseball_collector_started", at: new Date().toISOString() }));
  await collector.run(controller.signal);
  console.log(JSON.stringify({ event: "baseball_collector_stopped", at: new Date().toISOString() }));
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ event: "baseball_collector_fatal", error: error.message }));
  process.exitCode = 1;
});

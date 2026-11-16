const { spawn } = require("node:child_process");
const path = require("node:path");

const scripts = ["football/collectScores.js", "baseball/collectScores.js", "basketball/collectScores.js"];
const children = new Set();
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for (const script of scripts) {
  const child = spawn(process.execPath, [path.join(__dirname, script)], { stdio: "inherit" });
  children.add(child);
  child.once("error", (error) => {
    console.error(JSON.stringify({ event: "collector_process_error", collector: script, error: error.message }));
    process.exitCode = 1;
    stop();
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(JSON.stringify({ event: "collector_process_exited", collector: script, code, signal }));
      process.exitCode = 1;
      stop();
    }
  });
}

// Run only against a disposable, empty local database with this migration applied.
// See supabase/README.md for the local Supabase and standalone PostgREST options.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createHmac } = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { createServerSupabaseClient } = require("../supabase");
const { createFootballProvider } = require("../footballProvider");
const { createFootballStore } = require("../footballStore");
const { createCollector } = require("../collectScores");
const { Router } = require("../score");
const { espnEvent } = require("./fixtures");

function localUrl(value) {
  const url = new URL(value);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Integration tests require a local database URL");
  return url;
}

function signToken(role, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function runWorker(url, key) {
  const child = spawn(process.execPath, ["api/collectScores.js"], {
    env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: url,
      SUPABASE_SECRET_KEY: key, SUPABASE_SERVICE_ROLE_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Worker did not collect: ${output}`)), 20_000);
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.includes('"football_schedule_discovered"')) { clearTimeout(timer); resolve(); }
      });
      child.stderr.on("data", (chunk) => { output += chunk.toString(); });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error(`Worker exited early: ${output}`)); });
    });
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }
  assert.equal(child.exitCode, 0, output);
  return output;
}

test("real RPC → stored history → authenticated Express response", { timeout: 90_000 }, async (t) => {
  const configuredUrl = process.env.FOOTBALL_TEST_URL;
  assert.ok(configuredUrl, "Set FOOTBALL_TEST_URL to an empty local Supabase or PostgREST instance");
  const target = localUrl(configuredUrl);
  let supabaseUrl = target.origin;
  // Standalone PostgREST has no /rest/v1 gateway. This proxy supplies only that
  // path mapping; all queries, JWT validation, RPC and RLS use the real database.
  if (process.env.FOOTBALL_TEST_STANDALONE === "1") {
    const gateway = http.createServer((req, res) => {
      const proxy = http.request(new URL(req.url.replace(/^\/rest\/v1/, ""), target), {
        method: req.method, headers: req.headers,
      }, (upstream) => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      });
      proxy.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(proxy);
    });
    supabaseUrl = await listen(gateway);
    t.after(() => new Promise((resolve) => gateway.close(resolve)));
  }
  const secret = process.env.FOOTBALL_TEST_JWT_SECRET;
  const serviceKey = process.env.FOOTBALL_TEST_SERVICE_KEY || (secret && signToken("service_role", secret));
  const userKey = process.env.FOOTBALL_TEST_USER_KEY || (secret && signToken("authenticated", secret));
  const anonKey = process.env.FOOTBALL_TEST_ANON_KEY || (secret && signToken("anon", secret));
  assert.ok(serviceKey && userKey && anonKey, "Provide local test JWT keys or FOOTBALL_TEST_JWT_SECRET");
  const service = createServerSupabaseClient({ NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, SUPABASE_SECRET_KEY: serviceKey });
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const user = createClient(supabaseUrl, userKey, clientOptions);
  const anon = createClient(supabaseUrl, anonKey, clientOptions);
  const initial = await service.from("football_games").select("event_id", { count: "exact", head: true });
  assert.equal(initial.error, null);
  assert.equal(initial.count, 0, "Use an empty disposable database for deterministic replay");

  const app = express();
  app.use((req, res, next) => { req.supabase = user; next(); });
  app.use("/score", Router);
  const webServer = http.createServer(app);
  const webUrl = await listen(webServer);
  t.after(() => new Promise((resolve) => webServer.close(resolve)));
  assert.equal((await fetch(`${webUrl}/score`)).status, 503);

  let time = new Date("2026-11-07T20:15:00Z");
  const scheduled = espnEvent();
  scheduled.id = "999000010";
  let current = structuredClone(scheduled);
  const provider = createFootballProvider({ now: () => time, fetchImpl: async (url) =>
    Response.json(url.includes("/summary?") ? { header: current }
      : { events: url.includes("seasontype=2") ? [scheduled] : [] }),
  });
  const store = createFootballStore(service);
  const options = { provider, store, now: () => time, log: () => {} };
  let collector = createCollector(options);
  const history = async () => {
    const result = await user.from("football_score_changes").select("*")
      .eq("event_id", scheduled.id).order("observed_at");
    assert.equal(result.error, null);
    return result.data;
  };
  const readApi = async () => {
    const response = await fetch(`${webUrl}/score`);
    assert.equal(response.status, 200);
    return response.json();
  };

  await collector.runOnce();
  assert.equal((await readApi()).nextGame.eventId, scheduled.id);
  assert.equal((await history()).length, 1);

  async function stage(at, state, status, score, clock = "15:00") {
    time = new Date(at);
    const c = current.competitions[0];
    c.status = { period: state === "post" ? 4 : 1, displayClock: clock,
      type: { state, name: status, completed: state === "post", detail: status } };
    c.competitors.find((team) => team.team.id === "264").score = String(score);
    c.competitors.find((team) => team.team.id !== "264").score = "0";
    await collector.runOnce();
  }

  await stage("2026-11-07T20:30:00Z", "in", "STATUS_IN_PROGRESS", 0);
  assert.equal((await readApi()).game.uwScore, 0);
  await stage("2026-11-07T20:30:15Z", "in", "STATUS_IN_PROGRESS", 7);
  assert.equal((await readApi()).game.uwScore, 7);
  // A new collector must recover deadlines from the DB. Its schedule refresh
  // also must not overwrite the already collected live state.
  collector = createCollector(options);
  await stage("2026-11-07T20:30:30Z", "in", "STATUS_IN_PROGRESS", 7, "14:45");
  assert.equal((await history()).length, 3);
  assert.equal((await readApi()).game.clock, "14:45");
  await stage("2026-11-07T22:00:00Z", "post", "STATUS_FINAL", 24, "0:00");
  await stage("2026-11-07T22:05:00Z", "post", "STATUS_FINAL", 24, "0:00");
  collector = createCollector(options);
  await stage("2026-11-08T22:00:00Z", "post", "STATUS_FINAL", 23, "0:00");
  const changes = await history();
  assert.equal(changes.length, 5);
  assert.deepEqual(changes.map((row) => row.uw_score), [null, 0, 7, 24, 23]);
  assert.equal((await readApi()).game.uwScore, 23);
  const finalObservation = await provider.getGame({ event_id: scheduled.id, season: 2026 });
  await Promise.all(Array.from({ length: 4 }, () => store.record(finalObservation)));
  assert.equal((await history()).length, 5, "Concurrent duplicate observations cannot append history");
  assert.deepEqual(await store.dueGames(time), [], "Next-day recheck completes the persisted collection schedule");

  assert.ok((await anon.from("football_games").select("*")).error, "Anonymous reads are denied");
  assert.ok((await user.rpc("record_football_observation", { observation: finalObservation })).error,
    "Authenticated clients cannot ingest");
  assert.ok((await user.from("football_games").update({ uw_score: 999 }).eq("event_id", scheduled.id)).error,
    "Authenticated clients cannot update scores");

  if (process.env.FOOTBALL_TEST_LIVE === "1") {
    // Real worker processes use the real ESPN feed, but all writes stay local.
    // No dashboard or production application is started.
    await runWorker(supabaseUrl, serviceKey);
    const first = await service.from("football_games").select("event_id").neq("event_id", scheduled.id);
    assert.equal(first.error, null);
    assert.ok(first.data.length > 0, "Worker collected UW games without a browser");
    const before = await service.from("football_score_changes").select("id", { count: "exact", head: true });
    await runWorker(supabaseUrl, serviceKey);
    const after = await service.from("football_score_changes").select("id", { count: "exact", head: true });
    assert.equal(after.count, before.count, "Restart did not duplicate baseline history");
    console.log(`Real worker collected ${first.data.length} UW games and restarted cleanly.`);
  }
});

# UW Score Tracker

Express serves Next.js and the authenticated APIs. A separate Node worker
collects University of Washington football scores while the dashboard is closed.
Use Node.js 22 or newer.

## Startup

Install dependencies with `npm ci`. Configure `.env.development`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET
```

The legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported. Keep privileged keys on
the server. Review and apply migrations using [the database guide](supabase/README.md)
before collection; the worker never applies migrations.

Run `npm run dev` and `npm run collect:scores` in separate terminals. Open
`http://localhost:5000` (or your configured `PORT`), sign in, and visit
the Live Scores page at `/` (sign-in is at `/login`). Without `NEXT_PUBLIC_SERVER`, browser API calls use the same origin.
For a separate API origin, configure that variable and `SERVER_CORS`.

## Collection and storage

- `api/footballProvider.js` discovers ESPN team `264` hourly, requesting regular
  season and postseason separately. January/February discovery includes the
  previous season. The requested season overrides inconsistent feed metadata.
- `api/collectScores.js` fetches game details every 15 seconds from 15 minutes
  before kickoff through completion, including overtime and delays.
  Canceled/postponed games and TBD kickoffs are checked hourly. Finals are
  checked again after five minutes and one day.
- `api/footballStore.js` calls a transactional database function.
  `football_games` stores latest observations and polling deadlines;
  `football_score_changes` stores baselines and score/status changes. Clock-only
  changes update the latest observation without appending history.

Existing completed games get one baseline, without invented scoring sequences.
Downward corrections are accepted. Duplicate and older observations are ignored.
Per-game serialization makes updating the latest observation and history atomic.
Persisted deadlines preserve final rechecks across restarts.

Provider requests time out after 10 seconds. Errors back off from 15 seconds to
five minutes; longer `Retry-After` values are honored. Rate limiting pauses all
ESPN requests. Failures preserve stored scores. Run one worker instance.

History is retained indefinitely. Several changes between polls may appear as
one change; timestamps describe observations, not exact scoring times. Pregame
scores, period and clock may be null. ESPN's public endpoint is undocumented
and may change.

## API and dashboard

`GET /score` requires the existing Supabase Bearer token and reads stored data
through the caller's authenticated Supabase client. It never fetches ESPN.
The response is `{ game, nextGame, source, fetchedAt, stale }`:

- `game`: active game, otherwise latest completed game, or null.
- `nextGame`: earliest scheduled game, or null. Canceled/postponed games are
  excluded from active/next selections.
- `source`: `"ESPN"`; `fetchedAt`: relevant stored observation's ISO timestamp.
- `stale`: true when an active/approaching game has not updated for over 60 seconds.

Game objects contain `eventId`, `season`, `kickoff`, `startTimeTbd`, `opponent`
(`id`, `name`), `homeAway`, `uwScore`, `opponentScore`, `state` (`pre/in/post`),
`status`, `statusDetail`, `completed`, `period`, `clock`, and `observedAt`.
Before the first stored game the API returns 503 with `error.reason` and
`stale: true`. Database read failures return a controlled 503; provider outages
alone do not prevent serving stored results. Responses use `Cache-Control: no-store`.

`getScore({ signal })` remains the browser helper; its optional signal cancels
requests on unmount. The Live Scores dashboard maps the latest/completed and next
football games into the Football tab, shows stale/error notices and manual
refresh, and leaves unconnected sports with their existing placeholders.
Automatic refresh runs every 15 seconds during/approaching games and every minute
otherwise. Failed refreshes retain the last result.

### Development API logs

With `npm run dev`, an expandable log below the sport tabs shows the latest ten
score requests: URL, HTTP status, duration, timestamp, request ID and response JSON
(including failures). Expand an individual entry to inspect its full payload.
The browser console also prints these entries under `[Score API]`.

The Express terminal prints `football_score_api_request` entries; match their
`requestId` to the browser log's ID to trace a request. Logging includes selected
score response data, without request headers or authentication tokens. The panel
and request diagnostics are enabled only in development. Restart the web server
after changing server code; the separate score collector can keep running.

## Production

Run `npm run build`, then `npm start` for the web service and
`NODE_ENV=production npm run collect:scores` for a separate worker. Supply production
variables through the host's environment or secret store. Configure the host to
restart one worker after exit.

For Linux, [the systemd unit](deploy/uw-football-collector.service) supplies
automatic restart. Adjust its user, paths, Node executable and environment file
before installing/enabling it through your normal deployment process.
`deploy/` holds deployment configuration; runtime code stays in `api/`.

The worker emits JSON startup, discovery, observation, retry and shutdown logs.
Monitor `football_collection_error` / `football_collector_fatal` and active games
whose API data becomes stale. SIGINT/SIGTERM stop the loop and cancel feed requests.

## Verification

```sh
npm run test:scores
npm run build
npm run smoke:scores
```

The smoke check uses the real ESPN feed without DB writes or credentials.
SQL tests cover history, scheduling, atomicity and RLS. The integration suite
replays a game through the real RPC and Express route, and can launch the actual
worker twice to verify background collection and restart behavior. See
[the test setup](api/tests/README.md) for reproducible local commands.

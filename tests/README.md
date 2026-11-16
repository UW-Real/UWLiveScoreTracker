# Football verification

`npm run test:scores` uses Node's built-in test runner for isolated provider,
worker and API checks. `npm run smoke:scores` makes read-only ESPN requests.
Neither command needs Supabase credentials.

With local Supabase running, `npm run supabase:test` runs the SQL tests. See
`supabase/README.md`. The football test rolls back its fixtures; the existing
account test additionally needs the Supabase Auth schema.

## Disposable PostgreSQL/PostgREST setup

Docker must be running. Use empty ports 55439/55440 and run from the repo root.
These fixed credentials are only for the disposable test database.

```sh
docker network create uw-football-test
docker run --detach --name uw-football-test-db --network uw-football-test \
  --env POSTGRES_PASSWORD=local-football-tests --env POSTGRES_DB=football_tests \
  --publish 127.0.0.1:55439:5432 postgres:17
```

Wait until `docker exec uw-football-test-db pg_isready -U postgres` reports ready.
Bootstrap test roles and apply only the football migration:

```sh
docker exec -i uw-football-test-db psql -U postgres -d football_tests -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
grant usage on schema public, extensions to anon, authenticated, service_role;
SQL
docker exec -i uw-football-test-db psql -U postgres -d football_tests -v ON_ERROR_STOP=1 \
  < supabase/migrations/20261107000000_collect_football_scores.sql
docker run --detach --name uw-football-test-rest --network uw-football-test \
  --publish 127.0.0.1:55440:3000 \
  --env PGRST_DB_URI=postgres://postgres:local-football-tests@uw-football-test-db:5432/football_tests \
  --env PGRST_DB_ANON_ROLE=anon \
  --env PGRST_JWT_SECRET=local-football-test-secret-at-least-32-characters \
  --env PGRST_DB_SCHEMAS=public postgrest/postgrest:latest
```

Install pgTAP inside the test container and run the SQL suite:

```sh
docker exec uw-football-test-db sh -c 'apt-get update -qq && apt-get install -y -qq postgresql-17-pgtap'
docker cp supabase/tests/football_scores.test.sql uw-football-test-db:/tmp/football_scores.test.sql
docker exec uw-football-test-db pg_prove -U postgres -d football_tests /tmp/football_scores.test.sql
```

Run integration against the **empty local test database**:

```sh
FOOTBALL_TEST_URL=http://127.0.0.1:55440 \
FOOTBALL_TEST_STANDALONE=1 \
FOOTBALL_TEST_JWT_SECRET=local-football-test-secret-at-least-32-characters \
FOOTBALL_TEST_LIVE=1 \
npm run test:scores:integration
```

This replays scheduled → live → scoring change → final → correction through the
provider, collector, real Supabase client/RPC, history and authenticated Express
response. It checks concurrent retries and read/write permissions. The live flag
also launches the actual collector as two successive Node processes, using ESPN
but writing only locally, to verify collection without a browser, graceful
shutdown and no duplicated baselines after restart. Omit the live flag for an
offline provider replay.

Recreate the test database before rerunning integration; it deliberately refuses
a nonempty database. A local Supabase stack also works with
`FOOTBALL_TEST_URL=http://127.0.0.1:54321`, its JWT secret, and no standalone flag.
Alternatively supply local `FOOTBALL_TEST_SERVICE_KEY`, `FOOTBALL_TEST_USER_KEY`
(authenticated JWT), and `FOOTBALL_TEST_ANON_KEY`. The harness rejects non-loopback
URLs and does not read `.env.development`.

Remove the disposable setup after testing:

```sh
docker rm --force --volumes uw-football-test-rest uw-football-test-db
docker network rm uw-football-test
```

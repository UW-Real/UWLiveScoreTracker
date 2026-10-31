# Database migrations

Keep database changes in `supabase/migrations/` as timestamped SQL files.
The initial migration creates the `account_usernames` directory used by
`POST /auth/signup` and `POST /auth/signin`.

## Apply to a hosted Supabase project

Run these commands from the repository root:

```sh
npx supabase login
npm run supabase:link -- --project-ref YOUR_PROJECT_REF
npm run supabase:preview
npm run supabase:push
```

Use this app's Supabase project reference. `supabase:preview` lists pending
migrations without applying them; `supabase:push` applies them and records the
migration history. The CLI may prompt for the database password. The application's
`SUPABASE_SECRET_KEY` is not a database password or CLI access token.

If the project already has migration history from another repository, reconcile
that history before pushing; do not mark unknown migrations as reverted.

Alternatively, run the initial SQL file in the project's SQL Editor. If you later
switch to the CLI, record that manually applied migration after linking:

```sh
npx supabase migration repair 20261031000000 --status applied
```

Only run that repair command when the matching SQL has already succeeded on the
linked project.

## Authentication setup

- Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  and the server-only `SUPABASE_SECRET_KEY` in the app environment.
- In the hosted project's **Authentication → URL Configuration**, set the Site URL
  to `http://localhost:8000` for development and your actual URL for production.
  Allow the corresponding root redirect URL. The local `config.toml` does not
  change hosted Auth settings when you run `db push`.
- Restart the app after changing environment variables.

The database reserves lowercase usernames with 3–24 letters, numbers, or
underscores when an Auth user is created. The unique constraint prevents two
accounts from claiming the same username, including simultaneous signups.
Email changes stay in sync, deleting an Auth user deletes its directory entry,
and user metadata changes do not rename reserved usernames.

Existing accounts with valid username metadata are backfilled. Accounts without
a valid username retain email sign-in. If existing accounts claim the same
normalized username, the migration fails atomically; resolve the conflict before
retrying. Existing directory usernames are preserved.

The directory enables row-level security and grants only read access to the
server's `service_role`. Browsers cannot read or modify these email mappings.
Passwords remain managed by Supabase Auth and are not stored in this table.

## Future changes

```sh
npm run supabase:migration -- describe_your_change
# Edit the new supabase/migrations/<timestamp>_describe_your_change.sql file.
npm run supabase:preview
npm run supabase:push
```

Create a new migration for each subsequent change instead of editing one already
applied. The current app has no score persistence API, so no score tables are
introduced yet.

## Local database tests

With Docker running:

```sh
npx supabase start
npx supabase migration up --local
npm run supabase:test
```

The pgTAP tests run in a transaction and roll back their test accounts. They check
username validation and uniqueness, email syncing, deletion, and access controls.

References: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[Auth user triggers](https://supabase.com/docs/guides/auth/managing-user-data).

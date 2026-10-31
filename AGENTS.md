<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working principle

Keep this project easy for a teammate to follow. Extend the existing structure
by default. Improve it when a concrete feature or maintenance problem warrants
the change; preserving the structure must not prevent fixing bugs.

## Where code belongs

| Location | Responsibility |
| --- | --- |
| `app.js` | Express/Next.js startup, shared middleware, and mounting routers. |
| `api/` | Express routes, server-side validation, and database operations. |
| `src/app/` | Next.js pages, layouts, and global styles. |
| `src/components/` | UI components and their local interaction state. |
| `src/api/` | Named browser functions for calling the Express API. |
| `src/utils/` | Shared clients, configuration, and small focused helpers. |
| `supabase/migrations/` | Versioned database changes, including constraints and RLS. |
| `supabase/tests/` | Database behavior and access-control tests. |
| `public/` | Static assets. |

- Keep `app.js` focused on wiring; put feature endpoints in `api/` routers.
- Follow the existing feature flow: component → `src/api/` function → shared
  Axios client → Express route → Supabase. Browser Supabase usage for auth
  session management is an existing exception.
- Reuse the shared Axios and Supabase helpers instead of creating duplicate
  clients in components. Keep server secrets and privileged database access on
  the server; user-scoped operations must respect the user's authorization/RLS.
- Extend this backend rather than adding a second implementation through Next.js
  route handlers or Server Actions unless the requested work needs that change.

## Keep changes readable and focused

- Use JavaScript and the conventions of nearby files. Keep CommonJS in the
  Express backend and ES modules in the frontend. Avoid language/framework
  migrations as a side effect of feature work.
- Prefer descriptive names and direct functions. Extract a component or helper
  when it clarifies a responsibility, removes meaningful duplication, or makes
  complex logic easier to test. Avoid speculative frameworks, generic factories,
  and layers introduced only for possible future use.
- Use the existing CSS approach; component CSS modules are fine as styles grow.
  Add a styling or state-management library only when it solves a concrete need.
- Comment on non-obvious decisions, constraints, and edge cases. Avoid comments
  that merely restate the code and arbitrary file/function length limits.
- Keep bug fixes and features scoped to the task. Avoid unrelated file moves,
  renames, formatting sweeps, dependency upgrades, and lockfile churn. Preserve
  other contributors' work.
- Preserve existing API contracts unless a change is necessary. When changing a
  contract, update its callers and relevant tests in the same change.

## Allow the structure to grow deliberately

- Routine additions within these folders do not need extra approval. Add folders
  or abstractions when existing ones no longer express a clear responsibility.
- For a necessary structural change or new dependency, state the concrete reason,
  make the smallest useful change, and update this map or the relevant README.
  Do not reorganize the whole project to deliver one feature.
- For a broad rewrite outside the requested scope, propose it separately and
  continue the parts of the task that fit the current structure.
- Keep the generated Next.js instructions above intact.

## Database changes

- Put schema, trigger, and RLS changes in new timestamped migrations. Do not edit
  migrations already applied to shared databases.
- Keep passwords in Supabase Auth; keep the username/email directory private.
  Include appropriate access rules when adding tables.
- Update `supabase/README.md` when setup changes. Creating a migration and
  applying it to a shared/hosted database are separate actions; do not apply it
  unless the task authorizes that database change.

## Verification and handoff

- Run checks appropriate to the change; use `npm run build` for frontend changes
  and relevant API/database checks for behavior changes. Add regression coverage
  for meaningful bugs and business rules, not every presentation-only edit.
- Report failed or unavailable checks accurately. Do not expand the task into
  unrelated tooling repairs just to claim a clean result.
- Finish with a brief explanation of what changed, where the main logic lives,
  what was verified, and any setup needed. Explain new dependencies or structural
  changes so a teammate can understand the result without reading the full diff.

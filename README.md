# UW Score Tracker

A live scores dashboard for University of Washington sports. The app uses Next.js
for the website and Express for its authenticated API. A separate worker collects
UW football scores from ESPN and stores the latest game data and score history
in Supabase.

## Run locally

Install dependencies with `npm ci`, configure Supabase, and apply the database
migration. See [the Supabase guide](supabase/README.md) for setup details.

Run the website and collector in separate terminals:

```sh
npm run dev
npm run collect:scores
```

The Live Scores page is at `/`; sign in at `/login`. During development, the
score API log appears below the sports tabs.

## Database schema

### `football_games`

One row per UW football game. Stores its latest known score, status, opponent,
kickoff and collection timestamps.

| Column | Description |
| --- | --- |
| `event_id` | ESPN event ID; primary key. |
| `season` | Football season. |
| `kickoff` | Scheduled kickoff timestamp. |
| `start_time_tbd` | Whether kickoff time is still to be determined. |
| `opponent_id`, `opponent_name` | ESPN opponent ID and display name. |
| `home_away` | Whether UW plays at home or away. |
| `uw_score`, `opponent_score` | Latest scores; null until reported. |
| `state` | ESPN game state: pregame, in progress, or postgame. |
| `status`, `status_detail` | ESPN status code and display detail. |
| `completed` | Whether the game is final. |
| `period`, `clock` | Latest period and game clock, when available. |
| `observed_at` | Time the latest game data was collected. |
| `final_observed_at` | Time the game was first observed as final. |
| `next_poll_at` | When the collector should check this game again. |

### `football_score_changes`

A history of each game's initial observation and later score or status changes.
Clock-only updates do not create history rows.

| Column | Description |
| --- | --- |
| `id` | Unique history row ID. |
| `event_id` | ESPN event ID; links to `football_games`. |
| `observed_at` | Time the change was observed. |
| `uw_score`, `opponent_score` | Scores at that observation. |
| `state` | Pregame, in progress, or postgame. |
| `status`, `status_detail` | ESPN status code and display detail. |
| `completed` | Whether the game was final at that observation. |
| `period`, `clock` | Period and clock, when available. |
| `baseline` | True for the first observation stored for a game. |

Signed-in users can read the score tables. The server-side collector writes through
the `record_football_observation` database function.

begin;

create table public.football_games (
  event_id text primary key check (event_id ~ '^[0-9]+$'),
  season integer not null check (season between 1900 and 3000),
  kickoff timestamptz not null,
  start_time_tbd boolean not null default false,
  opponent_id text not null check (opponent_id ~ '^[0-9]+$' and opponent_id <> '264'),
  opponent_name text not null check (length(opponent_name) > 0),
  home_away text not null check (home_away in ('home', 'away')),
  uw_score integer check (uw_score >= 0),
  opponent_score integer check (opponent_score >= 0),
  state text not null check (state in ('pre', 'in', 'post')),
  status text not null,
  status_detail text not null,
  completed boolean not null,
  period integer check (period >= 0),
  clock text,
  observed_at timestamptz not null,
  final_observed_at timestamptz,
  next_poll_at timestamptz,
  check ((state <> 'in' and not completed) or (uw_score is not null and opponent_score is not null))
);

create index football_games_due on public.football_games (next_poll_at) where next_poll_at is not null;
create index football_games_kickoff on public.football_games (kickoff desc);

create table public.football_score_changes (
  id bigint generated always as identity primary key,
  event_id text not null references public.football_games(event_id) on delete cascade,
  observed_at timestamptz not null,
  uw_score integer check (uw_score >= 0),
  opponent_score integer check (opponent_score >= 0),
  state text not null check (state in ('pre', 'in', 'post')),
  status text not null,
  status_detail text not null,
  completed boolean not null,
  period integer check (period >= 0),
  clock text,
  baseline boolean not null,
  unique (event_id, observed_at)
);

alter table public.football_games enable row level security;
alter table public.football_score_changes enable row level security;
revoke all on public.football_games, public.football_score_changes from public, anon, authenticated, service_role;
revoke all on sequence public.football_score_changes_id_seq from public, anon, authenticated, service_role;
grant select on public.football_games, public.football_score_changes to authenticated, service_role;
create policy football_games_read on public.football_games for select to authenticated using (true);
create policy football_score_changes_read on public.football_score_changes for select to authenticated using (true);

-- Only the server may invoke ingestion. One transaction serializes observations
-- for a game, updates the latest state, and appends history together.
create function public.record_football_observation(observation jsonb, schedule_only boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming public.football_games;
  previous public.football_games;
  had_game boolean;
begin
  incoming := pg_catalog.jsonb_populate_record(null::public.football_games, observation);
  if incoming.event_id is null or incoming.observed_at is null then
    raise exception 'Event ID and observation timestamp are required' using errcode = '23502';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(incoming.event_id, 0));
  select * into previous from public.football_games where event_id = incoming.event_id for update;
  had_game := found;
  if had_game and incoming.observed_at <= previous.observed_at then
    return false;
  end if;

  if had_game and schedule_only then
    -- Discovery refreshes metadata, never overwrites a fresher live score or
    -- makes an old score appear fresh. A schedule change triggers a detail check.
    update public.football_games set
      kickoff = incoming.kickoff,
      start_time_tbd = incoming.start_time_tbd,
      opponent_id = incoming.opponent_id,
      opponent_name = incoming.opponent_name,
      home_away = incoming.home_away,
      next_poll_at = case
        when not previous.completed and (
          previous.kickoff is distinct from incoming.kickoff or
          previous.start_time_tbd is distinct from incoming.start_time_tbd or
          previous.status is distinct from incoming.status
        ) then incoming.observed_at
        else previous.next_poll_at end
    where event_id = incoming.event_id;
    return false;
  end if;

  incoming.final_observed_at := case when incoming.completed
    then coalesce(case when previous.completed then previous.final_observed_at end, incoming.observed_at)
    else null end;

  incoming.next_poll_at := case
    when incoming.completed then case
      when incoming.observed_at < incoming.final_observed_at + interval '5 minutes'
        then incoming.final_observed_at + interval '5 minutes'
      when incoming.observed_at < incoming.final_observed_at + interval '1 day'
        then incoming.final_observed_at + interval '1 day'
      else null end
    when incoming.status in ('STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_CANCELLED')
      then incoming.observed_at + interval '1 hour'
    when incoming.state = 'pre' and incoming.start_time_tbd
      then incoming.observed_at + interval '1 hour'
    when incoming.state = 'pre' and incoming.kickoff > incoming.observed_at + interval '15 minutes'
      then incoming.kickoff - interval '15 minutes'
    else incoming.observed_at + interval '15 seconds'
  end;

  insert into public.football_games select incoming.*
  on conflict (event_id) do update set
    season = excluded.season, kickoff = excluded.kickoff,
    start_time_tbd = excluded.start_time_tbd,
    opponent_id = excluded.opponent_id, opponent_name = excluded.opponent_name,
    home_away = excluded.home_away, uw_score = excluded.uw_score,
    opponent_score = excluded.opponent_score, state = excluded.state,
    status = excluded.status, status_detail = excluded.status_detail,
    completed = excluded.completed, period = excluded.period, clock = excluded.clock,
    observed_at = excluded.observed_at, final_observed_at = excluded.final_observed_at,
    next_poll_at = excluded.next_poll_at;

  -- status_detail often contains the ticking clock. Compare the stable status
  -- code (including halftime, delays, etc.), not that display text.
  if not had_game or
    row(incoming.uw_score, incoming.opponent_score, incoming.state, incoming.status, incoming.completed)
      is distinct from
    row(previous.uw_score, previous.opponent_score, previous.state, previous.status, previous.completed)
  then
    insert into public.football_score_changes (
      event_id, observed_at, uw_score, opponent_score, state, status, status_detail, completed, period, clock, baseline
    ) values (
      incoming.event_id, incoming.observed_at, incoming.uw_score, incoming.opponent_score,
      incoming.state, incoming.status, incoming.status_detail, incoming.completed,
      incoming.period, incoming.clock, not had_game
    );
  end if;
  return true;
end;
$$;

revoke all on function public.record_football_observation(jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function public.record_football_observation(jsonb, boolean) to service_role;

commit;

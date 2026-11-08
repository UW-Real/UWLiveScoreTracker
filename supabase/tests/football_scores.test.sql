begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.football_fixture(overrides jsonb default '{}') returns jsonb
language sql as $$
  select '{"event_id":"999000001","season":2026,"kickoff":"2026-11-07T20:30:00Z",
    "start_time_tbd":false,"opponent_id":"213","opponent_name":"Penn State",
    "home_away":"home","uw_score":null,"opponent_score":null,"state":"pre",
    "status":"STATUS_SCHEDULED","status_detail":"Scheduled","completed":false,
    "period":null,"clock":null,"observed_at":"2026-11-07T20:00:00Z"}'::jsonb || overrides;
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.football_games'::regclass), 'Game RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.football_score_changes'::regclass), 'History RLS enabled');
select ok(not has_table_privilege('anon', 'public.football_games', 'select'), 'Anonymous reads denied');
select ok(not has_table_privilege('anon', 'public.football_score_changes', 'select'), 'Anonymous history reads denied');
select ok(has_table_privilege('authenticated', 'public.football_games', 'select'), 'Authenticated reads granted');
select ok(not has_table_privilege('authenticated', 'public.football_games', 'insert,update,delete'), 'Browser game writes denied');
select ok(not has_table_privilege('authenticated', 'public.football_score_changes', 'insert,update,delete'), 'Browser history writes denied');
select ok(not has_function_privilege('anon', 'public.record_football_observation(jsonb,boolean)', 'execute'), 'Anonymous ingestion denied');
select ok(not has_function_privilege('authenticated', 'public.record_football_observation(jsonb,boolean)', 'execute'), 'Browser ingestion denied');
select ok(has_function_privilege('service_role', 'public.record_football_observation(jsonb,boolean)', 'execute'), 'Collector ingestion granted');

set local role service_role;
select ok(public.record_football_observation(pg_temp.football_fixture(), true), 'Collector seeds scheduled baseline');
reset role;
select is((select count(*) from public.football_score_changes where event_id = '999000001'), 1::bigint, 'One baseline observation');
select ok((select baseline from public.football_score_changes where event_id = '999000001'), 'Initial observation labeled baseline');
select is((select uw_score from public.football_games where event_id = '999000001'), null::integer, 'Absent score stays null');
select is((select next_poll_at from public.football_games where event_id = '999000001'), '2026-11-07T20:15:00Z'::timestamptz, 'Polling begins fifteen minutes before kickoff');

set local role authenticated;
select is((select count(*) from public.football_games where event_id = '999000001'), 1::bigint, 'RLS permits authenticated game reads');
select is((select count(*) from public.football_score_changes where event_id = '999000001'), 1::bigint, 'RLS permits authenticated history reads');
select throws_ok($$select public.record_football_observation('{}'::jsonb)$$, '42501', null, 'Browser cannot execute ingestion');
select throws_ok($$update public.football_games set uw_score = 999 where event_id = '999000001'$$, '42501', null, 'Browser cannot update scores');
reset role;

select ok(not public.record_football_observation(pg_temp.football_fixture()), 'Identical timestamp ignored');
select ok(not public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T19:59:00Z","uw_score":99}')), 'Older observation ignored');
select is((select count(*) from public.football_score_changes where event_id = '999000001'), 1::bigint, 'Retries do not duplicate history');

select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T20:30:00Z","state":"in","status":"STATUS_IN_PROGRESS","uw_score":0,"opponent_score":0,"period":1,"clock":"15:00"}'));
select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T20:30:15Z","state":"in","status":"STATUS_IN_PROGRESS","status_detail":"14:45 - 1st","uw_score":0,"opponent_score":0,"period":1,"clock":"14:45"}'));
select is((select count(*) from public.football_score_changes where event_id = '999000001'), 2::bigint, 'Clock and display detail changes do not append history');
select is((select clock from public.football_games where event_id = '999000001'), '14:45', 'Latest clock updated');
select is((select next_poll_at from public.football_games where event_id = '999000001'), '2026-11-07T20:30:30Z'::timestamptz, 'Live polling uses fifteen seconds');

select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T20:45:00Z","uw_score":0}'), true);
select is((select state from public.football_games where event_id = '999000001'), 'in', 'Schedule discovery cannot regress live state');
select is((select observed_at from public.football_games where event_id = '999000001'), '2026-11-07T20:30:15Z'::timestamptz, 'Schedule discovery cannot freshen old live data');

select throws_ok($$select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T20:31:00Z","uw_score":-1}'))$$, '23514', null, 'Invalid score rejects the transaction');
select is((select observed_at from public.football_games where event_id = '999000001'), '2026-11-07T20:30:15Z'::timestamptz, 'Failed ingestion preserves latest observation');
select is((select count(*) from public.football_score_changes where event_id = '999000001'), 2::bigint, 'Failed ingestion preserves history');

select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T20:31:00Z","state":"in","status":"STATUS_IN_PROGRESS","uw_score":7,"opponent_score":0}'));
select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T20:31:15Z","state":"in","status":"STATUS_IN_PROGRESS","uw_score":6,"opponent_score":0}'));
select is((select uw_score from public.football_games where event_id = '999000001'), 6, 'Downward score correction accepted');
select is((select count(*) from public.football_score_changes where event_id = '999000001'), 4::bigint, 'Scoring change and correction recorded');
select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T21:30:00Z","state":"in","status":"STATUS_HALFTIME","uw_score":6,"opponent_score":0}'));
select is((select count(*) from public.football_score_changes where event_id = '999000001'), 5::bigint, 'Detailed status change recorded');

select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T22:00:00Z","state":"post","status":"STATUS_FINAL","completed":true,"uw_score":24,"opponent_score":21}'));
select is((select next_poll_at from public.football_games where event_id = '999000001'), '2026-11-07T22:05:00Z'::timestamptz, 'Final recheck persisted for five minutes later');
select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-07T22:05:00Z","state":"post","status":"STATUS_FINAL","completed":true,"uw_score":24,"opponent_score":21}'));
select is((select next_poll_at from public.football_games where event_id = '999000001'), '2026-11-08T22:00:00Z'::timestamptz, 'Next-day recheck persisted across worker restarts');
select public.record_football_observation(pg_temp.football_fixture('{"observed_at":"2026-11-08T22:00:00Z","state":"post","status":"STATUS_FINAL","completed":true,"uw_score":23,"opponent_score":21}'));
select is((select next_poll_at from public.football_games where event_id = '999000001'), null::timestamptz, 'Polling stops after next-day correction check');
select is((select count(*) from public.football_score_changes where event_id = '999000001'), 7::bigint, 'Replay retains baseline, live, scoring changes, status, final, correction');

select public.record_football_observation(pg_temp.football_fixture('{"event_id":"999000002","state":"post","status":"STATUS_FINAL","completed":true,"uw_score":37,"opponent_score":31}'), true);
select is((select count(*) from public.football_score_changes where event_id = '999000002'), 1::bigint, 'Historical final seeds one baseline, no fabricated timeline');
select public.record_football_observation(pg_temp.football_fixture('{"event_id":"999000003","status":"STATUS_POSTPONED"}'));
select is((select next_poll_at from public.football_games where event_id = '999000003'), '2026-11-07T21:00:00Z'::timestamptz, 'Postponed games poll hourly');
select public.record_football_observation(pg_temp.football_fixture('{"event_id":"999000004","status":"STATUS_CANCELED","state":"post"}'));
select is((select next_poll_at from public.football_games where event_id = '999000004'), '2026-11-07T21:00:00Z'::timestamptz, 'Canceled games poll hourly');
select public.record_football_observation(pg_temp.football_fixture('{"event_id":"999000005","start_time_tbd":true}'));
select is((select next_poll_at from public.football_games where event_id = '999000005'), '2026-11-07T21:00:00Z'::timestamptz, 'TBD times do not trigger premature live polling');

select * from finish();
rollback;

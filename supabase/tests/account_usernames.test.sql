begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

select has_table('public', 'account_usernames', 'Username directory exists');
select ok((select relrowsecurity from pg_class where oid = 'public.account_usernames'::regclass), 'RLS is enabled');
select ok(not has_table_privilege('anon', 'public.account_usernames', 'select'), 'Anonymous clients cannot read emails');
select ok(not has_table_privilege('authenticated', 'public.account_usernames', 'select'), 'Signed-in clients cannot read emails');
select ok(has_table_privilege('service_role', 'public.account_usernames', 'select'), 'Server can resolve usernames');
select ok(not has_function_privilege('anon', 'public.sync_account_username()', 'execute'), 'Anonymous clients cannot invoke the trigger function');
select ok(not has_function_privilege('authenticated', 'public.sync_account_username()', 'execute'), 'Signed-in clients cannot invoke the trigger function');

insert into auth.users (id, email, raw_user_meta_data)
values ('ab000000-0000-0000-0000-000000000001', 'migration-test@example.invalid', '{"username":"Migration_Test"}');

select is((select username from public.account_usernames where user_id = 'ab000000-0000-0000-0000-000000000001'), 'migration_test', 'Signup normalizes the username');
select is((select email from public.account_usernames where user_id = 'ab000000-0000-0000-0000-000000000001'), 'migration-test@example.invalid', 'Signup reserves the email mapping');

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values ('ab000000-0000-0000-0000-000000000002', 'duplicate@example.invalid', '{"username":"MIGRATION_TEST"}')$$,
  '23505', null, 'Case variants cannot claim an existing username'
);
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values ('ab000000-0000-0000-0000-000000000003', 'invalid@example.invalid', '{"username":"bad-name!"}')$$,
  '23514', null, 'Invalid usernames are rejected by the database'
);

update auth.users set raw_user_meta_data = '{}' where id = 'ab000000-0000-0000-0000-000000000001';
update auth.users set email = 'updated@example.invalid' where id = 'ab000000-0000-0000-0000-000000000001';
select is((select email from public.account_usernames where user_id = 'ab000000-0000-0000-0000-000000000001'), 'updated@example.invalid', 'Email sync works even after username metadata is removed');
select is((select username from public.account_usernames where user_id = 'ab000000-0000-0000-0000-000000000001'), 'migration_test', 'Metadata edits do not change the reserved username');

delete from auth.users where id = 'ab000000-0000-0000-0000-000000000001';
select is((select count(*) from public.account_usernames where user_id = 'ab000000-0000-0000-0000-000000000001'), 0::bigint, 'Deleting the Auth user removes its mapping');

insert into auth.users (id, email, raw_user_meta_data)
values ('ab000000-0000-0000-0000-000000000004', 'email-only@example.invalid', '{}');
select is((select count(*) from public.account_usernames where user_id = 'ab000000-0000-0000-0000-000000000004'), 0::bigint, 'Email-only accounts remain supported');

select * from finish();
rollback;

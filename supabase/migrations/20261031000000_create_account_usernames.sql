-- Username sign-in resolves email addresses through the Express server only.
begin;

create table if not exists public.account_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  email text not null
);

alter table public.account_usernames enable row level security;

-- No browser policies: even authenticated users must not read email mappings.
revoke all on public.account_usernames from public, anon, authenticated, service_role;
grant select on public.account_usernames to service_role;

create or replace function public.sync_account_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  if tg_op = 'UPDATE' then
    -- A metadata edit must not rename a reserved username or stop email sync.
    update public.account_usernames
      set email = new.email
      where user_id = new.id;
    return new;
  end if;

  requested_username := lower(btrim(new.raw_user_meta_data ->> 'username'));
  if requested_username is null or requested_username = '' then
    -- Email-only accounts can still use Supabase's email sign-in.
    return new;
  end if;

  -- The unique constraint also protects concurrent signups for the same name.
  insert into public.account_usernames (user_id, username, email)
    values (new.id, requested_username, new.email);
  return new;
end;
$$;

revoke all on function public.sync_account_username() from public, anon, authenticated, service_role;

drop trigger if exists sync_account_username on auth.users;
create trigger sync_account_username
  after insert or update of email on auth.users
  for each row execute function public.sync_account_username();

-- Include accounts created before this migration. Invalid/missing usernames
-- retain email-only sign-in. Duplicate names abort rather than choosing an owner.
insert into public.account_usernames (user_id, username, email)
select id, lower(btrim(raw_user_meta_data ->> 'username')), email
from auth.users
where email is not null
  and lower(btrim(raw_user_meta_data ->> 'username')) ~ '^[a-z0-9_]{3,24}$'
on conflict (user_id) do update set email = excluded.email;

commit;

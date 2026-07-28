-- Paste this into Supabase Studio -> SQL Editor and run it.
-- Idempotent: safe to re-run.
--
-- `create table if not exists` does nothing when a table of that name already
-- exists, even if its columns differ. The `add column if not exists` lines are
-- what bring an already-created table up to date.

-- ---------------------------------------------------------------- profiles --
create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid()
                 references auth.users (id) on delete cascade,
  phone_number text default null,
  name         text default null
);

alter table public.profiles add column if not exists phone_number text default null;
alter table public.profiles add column if not exists name text default null;

alter table public.profiles enable row level security;

drop policy if exists "profiles: own rows" on public.profiles;
create policy "profiles: own rows"
  on public.profiles for all
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------------- calls --
-- "user" is a reserved word in Postgres, so it must be double-quoted
-- everywhere it appears.
create table if not exists public.calls (
  id        uuid primary key default gen_random_uuid(),
  summary   text default null,
  call_time timestamptz default now(),
  "user"    uuid default null references auth.users (id) on delete cascade
);

alter table public.calls alter column id set default gen_random_uuid();
alter table public.calls add column if not exists summary text default null;
alter table public.calls add column if not exists call_time timestamptz default now();
alter table public.calls add column if not exists "user" uuid default null
  references auth.users (id) on delete cascade;

create index if not exists calls_user_call_time_idx
  on public.calls ("user", call_time desc);

alter table public.calls enable row level security;

drop policy if exists "calls: own rows" on public.calls;
create policy "calls: own rows"
  on public.calls for all
  to authenticated
  using (auth.uid() = "user")
  with check (auth.uid() = "user");

-- ------------------------------------------------------- profile on signup --
-- Creates the profile row automatically so a new user has somewhere to save
-- their number. app.js also upserts, so this is belt-and-braces.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

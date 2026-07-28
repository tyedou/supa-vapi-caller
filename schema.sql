-- Paste this into Supabase Studio -> SQL Editor and run it once.
-- Idempotent: safe to re-run.
--
-- `create table if not exists` does nothing when a table of that name already
-- exists, even if its columns differ. The `add column if not exists` blocks
-- below are what bring an existing, partially-built table up to date.

-- ---------------------------------------------------------------- profiles --
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  phone_number text,
  created_at   timestamptz not null default now()
);

alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

-- app.js upserts on save, so INSERT is required for a user's first save.
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------------- calls --
create table if not exists public.calls (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  vapi_call_id text unique,
  summary      text,
  transcript   text,
  status       text,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);

-- Brings an existing `calls` table up to the shape the app expects.
-- user_id is added nullable so this succeeds even if the table already has
-- rows; pre-existing rows with a null user_id are invisible under RLS.
-- api/call.js does not send an id, so the column must generate its own.
alter table public.calls alter column id set default gen_random_uuid();
alter table public.calls add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.calls add column if not exists vapi_call_id text;
alter table public.calls add column if not exists summary text;
alter table public.calls add column if not exists transcript text;
alter table public.calls add column if not exists status text;
alter table public.calls add column if not exists started_at timestamptz not null default now();
alter table public.calls add column if not exists ended_at timestamptz;

-- The webhook matches on vapi_call_id, so it has to be unique.
create unique index if not exists calls_vapi_call_id_key
  on public.calls (vapi_call_id);

create index if not exists calls_user_id_started_at_idx
  on public.calls (user_id, started_at desc);

alter table public.calls enable row level security;

drop policy if exists "calls: select own" on public.calls;
create policy "calls: select own"
  on public.calls for select
  using (auth.uid() = user_id);

-- Deliberately no INSERT/UPDATE policy for end users. Call rows are written by
-- api/call.js and api/vapi-webhook.js with the service role key, which bypasses
-- RLS. Users can only read their own rows.

-- ------------------------------------------------------- profile on signup --
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

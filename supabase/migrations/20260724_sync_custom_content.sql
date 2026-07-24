-- Run this migration in the Supabase SQL editor before deploying the matching app build.

alter table public.schedule_events
  add column if not exists group_id text;

update public.schedule_events
  set group_id = 'life'
  where group_id is null;

create table if not exists public.schedule_groups (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 20),
  color text not null default 'blue',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.schedule_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calendar_zoom smallint not null default 0 check (calendar_zoom between 0 and 2),
  groups_initialized boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.schedule_groups (user_id, id, name, color)
  select distinct user_id, 'life', '生活表', 'mint'
  from public.schedule_events
  on conflict (user_id, id) do nothing;

insert into public.schedule_groups (user_id, id, name, color)
  select distinct user_id, 'course', '课程表', 'purple'
  from public.schedule_events
  on conflict (user_id, id) do nothing;

create index if not exists schedule_events_user_group_idx
  on public.schedule_events (user_id, group_id);

alter table public.schedule_groups enable row level security;
alter table public.schedule_preferences enable row level security;

drop policy if exists "Users manage their own schedule groups" on public.schedule_groups;
create policy "Users manage their own schedule groups"
  on public.schedule_groups
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own schedule preferences" on public.schedule_preferences;
create policy "Users manage their own schedule preferences"
  on public.schedule_preferences
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

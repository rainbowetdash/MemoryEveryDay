-- Recurring personal anniversaries. The client calculates the next occurrence each year.
create table if not exists public.anniversaries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anniversaries_user_id_idx on public.anniversaries (user_id);

alter table public.anniversaries enable row level security;

drop policy if exists "Users manage own anniversaries" on public.anniversaries;
create policy "Users manage own anniversaries"
  on public.anniversaries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Server-side quota and idempotency records for the voice assistant.
-- Voice transcripts are intentionally not stored.

create table if not exists public.voice_assistant_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count smallint not null default 0 check (request_count between 0 and 10),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists public.voice_assistant_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  usage_date date not null,
  provider text not null check (provider in ('deepseek', 'openai')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed', 'rejected')),
  item_count smallint not null default 0 check (item_count between 0 and 20),
  event_ids uuid[] not null default '{}',
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, request_id)
);

create index if not exists voice_assistant_requests_user_created_idx
  on public.voice_assistant_requests (user_id, created_at desc);

alter table public.voice_assistant_daily_usage enable row level security;
alter table public.voice_assistant_requests enable row level security;

drop policy if exists "Users read their voice assistant usage" on public.voice_assistant_daily_usage;
create policy "Users read their voice assistant usage"
  on public.voice_assistant_daily_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users read their voice assistant requests" on public.voice_assistant_requests;
create policy "Users read their voice assistant requests"
  on public.voice_assistant_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.claim_voice_assistant_usage(
  p_user_id uuid,
  p_usage_date date,
  p_timezone text,
  p_limit smallint default 10
)
returns table (allowed boolean, used smallint, remaining smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count smallint;
begin
  if p_user_id is null or p_limit < 1 or p_limit > 10 then
    raise exception 'Invalid voice assistant quota request';
  end if;

  insert into public.voice_assistant_daily_usage (
    user_id,
    usage_date,
    request_count,
    timezone
  )
  values (
    p_user_id,
    p_usage_date,
    1,
    left(coalesce(nullif(p_timezone, ''), 'UTC'), 80)
  )
  on conflict (user_id, usage_date) do update
    set request_count = public.voice_assistant_daily_usage.request_count + 1,
        timezone = excluded.timezone,
        updated_at = now()
    where public.voice_assistant_daily_usage.request_count < p_limit
  returning request_count into next_count;

  if next_count is null then
    select request_count
      into next_count
      from public.voice_assistant_daily_usage
      where user_id = p_user_id and usage_date = p_usage_date;
    return query select false, coalesce(next_count, p_limit), 0::smallint;
    return;
  end if;

  return query select true, next_count, greatest(0, p_limit - next_count)::smallint;
end;
$$;

revoke all on function public.claim_voice_assistant_usage(uuid, date, text, smallint) from public, anon, authenticated;
grant execute on function public.claim_voice_assistant_usage(uuid, date, text, smallint) to service_role;


-- Run this migration in the Supabase SQL editor before deploying the updated reminder function.

alter table public.schedule_events
  add column if not exists push_reminder boolean not null default false;

update public.schedule_events
  set push_reminder = wecom_reminder
  where wecom_reminder = true;

update public.schedule_events
  set wecom_reminder = false
  where wecom_reminder = true;

delete from public.wecom_reminders;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create table if not exists public.push_reminders (
  event_id uuid primary key references public.schedule_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'reminding', 'completed')),
  last_sent_at timestamptz,
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_reminders_due_idx
  on public.push_reminders (status, reminder_at);

create or replace function public.sync_push_reminder_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.push_reminder and new.reminder_at is not null then
    insert into public.push_reminders (event_id, user_id, reminder_at)
    values (new.id, new.user_id, new.reminder_at)
    on conflict (event_id) do update
      set user_id = excluded.user_id,
          reminder_at = excluded.reminder_at,
          status = case
            when public.push_reminders.reminder_at is distinct from excluded.reminder_at then 'pending'
            else public.push_reminders.status
          end,
          last_sent_at = case
            when public.push_reminders.reminder_at is distinct from excluded.reminder_at then null
            else public.push_reminders.last_sent_at
          end,
          sent_count = case
            when public.push_reminders.reminder_at is distinct from excluded.reminder_at then 0
            else public.push_reminders.sent_count
          end,
          updated_at = now();
  else
    delete from public.push_reminders where event_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists schedule_events_push_reminder_sync on public.schedule_events;
create trigger schedule_events_push_reminder_sync
  after insert or update of push_reminder, reminder_at on public.schedule_events
  for each row execute function public.sync_push_reminder_from_event();

insert into public.push_reminders (event_id, user_id, reminder_at)
  select id, user_id, reminder_at
  from public.schedule_events
  where push_reminder = true
    and reminder_at is not null
    and reminder_at >= now() - interval '15 minutes'
  on conflict (event_id) do nothing;

alter table public.push_subscriptions enable row level security;
alter table public.push_reminders enable row level security;

drop policy if exists "Users manage their own push subscriptions" on public.push_subscriptions;
create policy "Users manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

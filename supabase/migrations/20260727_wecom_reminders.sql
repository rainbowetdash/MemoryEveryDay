-- Run this migration in the Supabase SQL editor before deploying the reminder function.

alter table public.schedule_events
  add column if not exists wecom_reminder boolean not null default false,
  add column if not exists reminder_at timestamptz;

create table if not exists public.wecom_reminders (
  event_id uuid primary key references public.schedule_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'reminding', 'acknowledged')),
  last_sent_at timestamptz,
  sent_count integer not null default 0,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wecom_reminders_due_idx
  on public.wecom_reminders (status, reminder_at);

create or replace function public.sync_wecom_reminder_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.wecom_reminder and new.reminder_at is not null then
    insert into public.wecom_reminders (event_id, user_id, reminder_at)
    values (new.id, new.user_id, new.reminder_at)
    on conflict (event_id) do update
      set user_id = excluded.user_id,
          reminder_at = excluded.reminder_at,
          status = case
            when public.wecom_reminders.reminder_at is distinct from excluded.reminder_at then 'pending'
            else public.wecom_reminders.status
          end,
          last_sent_at = case
            when public.wecom_reminders.reminder_at is distinct from excluded.reminder_at then null
            else public.wecom_reminders.last_sent_at
          end,
          sent_count = case
            when public.wecom_reminders.reminder_at is distinct from excluded.reminder_at then 0
            else public.wecom_reminders.sent_count
          end,
          acknowledged_at = case
            when public.wecom_reminders.reminder_at is distinct from excluded.reminder_at then null
            else public.wecom_reminders.acknowledged_at
          end,
          acknowledged_by = case
            when public.wecom_reminders.reminder_at is distinct from excluded.reminder_at then null
            else public.wecom_reminders.acknowledged_by
          end,
          updated_at = now();
  else
    delete from public.wecom_reminders where event_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists schedule_events_wecom_reminder_sync on public.schedule_events;
create trigger schedule_events_wecom_reminder_sync
  after insert or update of wecom_reminder, reminder_at on public.schedule_events
  for each row execute function public.sync_wecom_reminder_from_event();

alter table public.wecom_reminders enable row level security;

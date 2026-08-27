-- Add manually completable todos alongside time-based schedule events.
alter table public.schedule_events
  add column if not exists item_type text not null default 'event',
  add column if not exists completed_at timestamptz;

alter table public.schedule_events
  drop constraint if exists schedule_events_item_type_check;

alter table public.schedule_events
  add constraint schedule_events_item_type_check
  check (item_type in ('event', 'todo'));

create index if not exists schedule_events_open_todos_idx
  on public.schedule_events (user_id, event_date, start_time)
  where item_type = 'todo' and completed_at is null;

-- Execution date/time and the deadline are independent. Existing schedules stay unchanged.
alter table public.schedule_events
  add column if not exists due_date date,
  alter column event_date drop not null,
  alter column start_time drop not null;
alter table public.schedule_events drop constraint if exists schedule_events_planning_check;
alter table public.schedule_events add constraint schedule_events_planning_check check (
  (event_date is not null and start_time is not null) or
  (item_type = 'todo' and event_date is null and start_time is null and end_time is null
   and mode = 'reminder' and not push_reminder and not wecom_reminder and reminder_at is null
   and cardinality(repeat_weekdays) = 0)
);
create index if not exists schedule_events_open_due_idx
  on public.schedule_events(user_id, due_date) where item_type = 'todo' and completed_at is null;
notify pgrst, 'reload schema';

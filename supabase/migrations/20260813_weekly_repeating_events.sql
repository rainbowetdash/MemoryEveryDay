-- 一条课程日程可在每周多个星期重复出现；空数组保持原来的单次日程行为。
alter table public.schedule_events
  add column if not exists repeat_weekdays smallint[] not null default '{}'::smallint[];

alter table public.schedule_events
  drop constraint if exists schedule_events_repeat_weekdays_check;

alter table public.schedule_events
  add constraint schedule_events_repeat_weekdays_check
  check (repeat_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

create index if not exists schedule_events_repeat_weekdays_idx
  on public.schedule_events using gin (repeat_weekdays);

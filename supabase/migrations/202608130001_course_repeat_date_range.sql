-- 学期型课程只在设定的开始和结束日期之间重复显示。
alter table public.schedule_events
  add column if not exists repeat_start_date date,
  add column if not exists repeat_end_date date;

update public.schedule_events
  set repeat_start_date = event_date
  where coalesce(array_length(repeat_weekdays, 1), 0) > 0
    and repeat_start_date is null;

alter table public.schedule_events
  drop constraint if exists schedule_events_repeat_date_range_check;

alter table public.schedule_events
  add constraint schedule_events_repeat_date_range_check
  check (repeat_end_date is null or repeat_start_date is null or repeat_end_date >= repeat_start_date);

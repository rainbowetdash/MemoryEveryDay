-- 日程可保存一段简短备注，供课程与独立日程使用。
alter table public.schedule_events
  add column if not exists note text not null default '';

alter table public.schedule_events
  drop constraint if exists schedule_events_note_length_check;

alter table public.schedule_events
  add constraint schedule_events_note_length_check
  check (char_length(note) <= 140);

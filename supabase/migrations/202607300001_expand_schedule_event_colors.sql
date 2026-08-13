-- Keep the cloud color rule aligned with every color offered in the schedule editor.
alter table public.schedule_events
  drop constraint if exists schedule_events_color_check;

alter table public.schedule_events
  add constraint schedule_events_color_check
  check (color in ('blue', 'navy', 'cyan', 'mint', 'purple', 'pink', 'coral', 'yellow', 'green'));

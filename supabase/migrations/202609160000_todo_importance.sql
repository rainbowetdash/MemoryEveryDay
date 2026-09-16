alter table public.schedule_events add column if not exists is_important boolean not null default false;
comment on column public.schedule_events.is_important is 'User-selected todo importance; urgency is derived from due_date in the user local calendar.';
notify pgrst, 'reload schema';

-- Preserve the selected month/day/hour unit for each anniversary reminder.
alter table public.anniversaries
  add column if not exists early_reminders jsonb not null default '[]'::jsonb;

update public.anniversaries
set early_reminders = coalesce((
  select jsonb_agg(jsonb_build_object('value', days, 'unit', 'day'))
  from unnest(early_reminder_days) as days
), '[]'::jsonb)
where early_reminders = '[]'::jsonb
  and cardinality(early_reminder_days) > 0;

-- Add editable native notification preferences to yearly anniversaries.
alter table public.anniversaries
  add column if not exists push_reminder boolean not null default false,
  add column if not exists reminder_time time not null default '09:00',
  add column if not exists early_reminder_days integer[] not null default '{}'::integer[];

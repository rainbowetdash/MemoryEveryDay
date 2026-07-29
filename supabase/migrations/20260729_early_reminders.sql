-- Add early_reminders column to schedule_events
ALTER TABLE public.schedule_events
ADD COLUMN IF NOT EXISTS early_reminders integer[] DEFAULT '{}'::integer[];

-- Index for efficient scanning of events with early reminders
CREATE INDEX IF NOT EXISTS idx_schedule_events_early_reminders
ON public.schedule_events USING GIN (early_reminders)
WHERE array_length(early_reminders, 1) > 0;

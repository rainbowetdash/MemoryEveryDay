# MemoryEveryDay
An app for reminding me of daily planning

## PWA push reminders

The app uses standard Web Push notifications. Each enabled event sends a notification at the scheduled time and repeats it every minute until the event is opened.

Deployment checklist:

1. Run `supabase/migrations/20260727_pwa_push_reminders.sql` in the Supabase SQL editor.
2. Run `supabase/migrations/20260728_acknowledge_push_reminders.sql` in the Supabase SQL editor.
3. Copy the VAPID values from the ignored local file `.env.push.local` into the `wecom-reminders` Edge Function secrets.
4. Redeploy `supabase/functions/wecom-reminders`. The legacy function name is intentionally retained so the existing one-minute Cron job does not need to change.
5. Keep either `PUSH_REMINDER_CRON_SECRET` or the existing `WECOM_REMINDER_CRON_SECRET` configured. The current Cron request header remains `x-reminder-cron-secret`.
6. Deploy the static site and verify the account dialog can enable and test notifications.

On iPhone and iPad, install the site to the Home Screen before enabling notifications.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

type Reminder = {
  event_id: string;
  user_id: string;
  reminder_at: string;
  status: "pending" | "reminding";
  last_sent_at: string | null;
  sent_count: number;
  schedule_events: {
    title: string;
    event_date: string;
    start_time: string;
  } | null;
};

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
  cronSecret: string;
};

const defaultPublicKey = "BBDWcU9vD0HrrR5mkFRTV_pW6Hb-raGQnwxKqvhIPpZk9yZTt5TDCLSXODbjUx4lrBmXxjw7at-z5qQ1FJ6QjJU";

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

function configFromEnvironment(): PushConfig | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || defaultPublicKey;
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "https://memoryeveryday.pages.dev";
  const cronSecret = Deno.env.get("PUSH_REMINDER_CRON_SECRET") || Deno.env.get("WECOM_REMINDER_CRON_SECRET");
  return publicKey && privateKey && subject && cronSecret ? { publicKey, privateKey, subject, cronSecret } : null;
}

function shouldSend(reminder: Reminder, now: number) {
  const reminderAt = new Date(reminder.reminder_at).getTime();
  if (reminder.status === "pending") return reminderAt >= now - 15 * 60_000 && reminderAt <= now;
  const lastSentAt = reminder.last_sent_at ? new Date(reminder.last_sent_at).getTime() : 0;
  return reminder.sent_count === 1 && now - lastSentAt >= 10 * 60_000;
}

function notificationPayload(reminder: Reminder) {
  const event = reminder.schedule_events;
  if (!event) throw new Error("Reminder event is unavailable");
  return JSON.stringify({
    title: reminder.sent_count ? "日程还在等你" : "每日备忘",
    body: `${event.title}\n${event.event_date} ${event.start_time.slice(0, 5)}`,
    tag: `event-${reminder.event_id}`,
    url: `/?date=${encodeURIComponent(event.event_date)}&event=${encodeURIComponent(reminder.event_id)}`,
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = configFromEnvironment();
  if (!config) return json({ error: "Push reminder function is not configured" }, 503);
  if (request.headers.get("x-reminder-cron-secret") !== config.cronSecret) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Database access is unavailable" }, 503);

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = Date.now();
  const { data, error } = await supabase
    .from("push_reminders")
    .select("event_id, user_id, reminder_at, status, last_sent_at, sent_count, schedule_events(title, event_date, start_time)")
    .in("status", ["pending", "reminding"])
    .lte("reminder_at", new Date(now).toISOString());

  if (error) return json({ error: "Unable to load reminders" }, 500);
  const loadedReminders = (data || []) as Reminder[];
  const expiredEventIds = loadedReminders
    .filter((reminder) => reminder.status === "pending" && new Date(reminder.reminder_at).getTime() < now - 15 * 60_000)
    .map((reminder) => reminder.event_id);
  if (expiredEventIds.length) {
    await supabase.from("push_reminders").update({ status: "completed", updated_at: new Date().toISOString() }).in("event_id", expiredEventIds);
  }
  const reminders = loadedReminders.filter((reminder) => shouldSend(reminder, now));
  if (!reminders.length) return json({ sent: 0 });

  const userIds = [...new Set(reminders.map((reminder) => reminder.user_id))];
  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subscriptionError) return json({ error: "Unable to load push subscriptions" }, 500);

  const subscriptions = (subscriptionRows || []) as Subscription[];
  let sent = 0;
  for (const reminder of reminders) {
    const userSubscriptions = subscriptions.filter((subscription) => subscription.user_id === reminder.user_id);
    if (!userSubscriptions.length) {
      await supabase.from("push_reminders").update({ status: "completed", updated_at: new Date().toISOString() }).eq("event_id", reminder.event_id);
      continue;
    }
    let delivered = 0;
    for (const subscription of userSubscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, notificationPayload(reminder), { TTL: 86_400, urgency: "high" });
        delivered += 1;
        sent += 1;
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
        console.error("Unable to send push reminder", { eventId: reminder.event_id, subscriptionId: subscription.id, statusCode, error });
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
        }
      }
    }

    if (delivered) {
      const nextCount = reminder.sent_count + 1;
      const sentAt = new Date().toISOString();
      await supabase.from("push_reminders").update({
        status: nextCount >= 2 ? "completed" : "reminding",
        last_sent_at: sentAt,
        sent_count: nextCount,
        updated_at: sentAt,
      }).eq("event_id", reminder.event_id);
    }
  }

  return json({ sent });
});

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
const encouragements = [
  "你已经开始了，接下来一步就好。",
  "按自己的节奏来，你做得到。",
  "先完成，再慢慢变好。",
  "现在做一点，之后会轻松很多。",
  "你的计划值得被认真对待。",
  "不用追求完美，先向前走。",
  "把注意力放回眼前这一件事。",
  "小小的行动也算进步。",
  "你比想象中更接近目标。",
  "今天的你也值得被肯定。",
  "只做下一步，不必一次做完全部。",
  "给自己一点耐心，继续就好。",
];

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
  return now - lastSentAt >= 30_000;
}

function notificationPayload(reminder: Reminder) {
  const event = reminder.schedule_events;
  if (!event) throw new Error("Reminder event is unavailable");
  const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
  return JSON.stringify({
    title: event.title,
    body: encouragement,
    tag: `event-${reminder.event_id}`,
    renotify: true,
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
  const dueWindowStart = new Date(now - 15 * 60_000).toISOString();
  const dueWindowEnd = new Date(now).toISOString();

  // --- Sync main reminders ---
  const { data: dueEventRows, error: dueEventError } = await supabase
    .from("schedule_events")
    .select("id, user_id, reminder_at")
    .eq("push_reminder", true)
    .not("reminder_at", "is", null)
    .gte("reminder_at", dueWindowStart)
    .lte("reminder_at", dueWindowEnd);
  if (dueEventError) return json({ error: "Unable to load due events" }, 500);

  const dueEvents = dueEventRows || [];
  if (dueEvents.length) {
    const dueEventIds = dueEvents.map((event) => event.id);
    const { data: queuedRows, error: queuedError } = await supabase
      .from("push_reminders")
      .select("event_id")
      .in("event_id", dueEventIds);
    if (queuedError) return json({ error: "Unable to verify reminder queue" }, 500);
    const queuedIds = new Set((queuedRows || []).map((reminder) => reminder.event_id));
    const missingReminders = dueEvents
      .filter((event) => !queuedIds.has(event.id))
      .map((event) => ({ event_id: event.id, user_id: event.user_id, reminder_at: event.reminder_at }));
    if (missingReminders.length) {
      const { error: queueError } = await supabase.from("push_reminders").insert(missingReminders);
      if (queueError) return json({ error: "Unable to repair reminder queue" }, 500);
    }
  }

  // --- Sync early reminders ---
  const { data: earlyEventRows, error: earlyEventError } = await supabase
    .from("schedule_events")
    .select("id, user_id, reminder_at, early_reminders")
    .eq("push_reminder", true)
    .not("reminder_at", "is", null)
    .not("early_reminders", "is", null);
  if (!earlyEventError && earlyEventRows) {
    for (const event of earlyEventRows) {
      const minutes = Array.isArray(event.early_reminders) ? event.early_reminders.filter((m : number) => typeof m === "number" && m > 0) : [];
      if (!minutes.length) continue;
      const eventTime = new Date(event.reminder_at).getTime();
      for (const m of minutes) {
        const earlyAt = new Date(eventTime - m * 60_000);
        if (earlyAt.getTime() > now - 15 * 60_000 && earlyAt.getTime() <= now) {
          const { data: existing } = await supabase
            .from("push_reminders")
            .select("event_id")
            .eq("event_id", event.id)
            .eq("reminder_at", earlyAt.toISOString())
            .maybeSingle();
          if (!existing) {
            await supabase.from("push_reminders").insert({
              event_id: event.id,
              user_id: event.user_id,
              reminder_at: earlyAt.toISOString(),
            });
          }
        }
      }
    }
  }

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
  if (!reminders.length) {
    console.log("Push reminder run", { dueEvents: dueEvents.length, loaded: loadedReminders.length, ready: 0, sent: 0 });
    return json({ sent: 0 });
  }

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
        status: "reminding",
        last_sent_at: sentAt,
        sent_count: nextCount,
        updated_at: sentAt,
      }).eq("event_id", reminder.event_id);
    }
  }

  console.log("Push reminder run", { dueEvents: dueEvents.length, loaded: loadedReminders.length, ready: reminders.length, subscriptions: subscriptions.length, sent });
  return json({ sent });
});

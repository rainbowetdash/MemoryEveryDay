import { createClient } from "npm:@supabase/supabase-js@2";

type Reminder = {
  event_id: string;
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

type WeComConfig = {
  corpId: string;
  appSecret: string;
  agentId: number;
  recipientUserId: string;
  cronSecret: string;
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

function configFromEnvironment(): WeComConfig | null {
  const corpId = Deno.env.get("WECOM_CORP_ID");
  const appSecret = Deno.env.get("WECOM_APP_SECRET");
  const agentId = Number(Deno.env.get("WECOM_AGENT_ID"));
  const recipientUserId = Deno.env.get("WECOM_RECIPIENT_USER_ID");
  const cronSecret = Deno.env.get("WECOM_REMINDER_CRON_SECRET");

  return corpId && appSecret && Number.isInteger(agentId) && agentId > 0 && recipientUserId && cronSecret
    ? { corpId, appSecret, agentId, recipientUserId, cronSecret }
    : null;
}

async function getAccessToken(config: WeComConfig) {
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.appSecret)}`);
  const payload = await response.json();
  if (!response.ok || payload.errcode) throw new Error(`WeCom token request failed: ${payload.errmsg || response.status}`);
  return String(payload.access_token);
}

async function sendReminder(accessToken: string, config: WeComConfig, reminder: Reminder) {
  const event = reminder.schedule_events;
  if (!event) throw new Error("Reminder event is unavailable");

  const content = `【每日备忘】\n${event.title}\n${event.event_date} ${event.start_time.slice(0, 5)}\n请回复任意消息停止提醒。`;
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      touser: config.recipientUserId,
      msgtype: "text",
      agentid: config.agentId,
      text: { content },
      safe: 0,
    }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errcode) throw new Error(`WeCom message failed: ${payload.errmsg || response.status}`);
}

function shouldSend(reminder: Reminder, now: number) {
  const reminderAt = new Date(reminder.reminder_at).getTime();
  if (reminder.status === "pending") return reminderAt >= now - 10 * 60_000 && reminderAt <= now;
  const lastSent = reminder.last_sent_at ? new Date(reminder.last_sent_at).getTime() : 0;
  return now - lastSent >= 55_000;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = configFromEnvironment();
  if (!config) return json({ error: "Reminder function is not configured" }, 503);
  if (request.headers.get("x-reminder-cron-secret") !== config.cronSecret) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Database access is unavailable" }, 503);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = Date.now();
  const { data, error } = await supabase
    .from("wecom_reminders")
    .select("event_id, reminder_at, status, last_sent_at, sent_count, schedule_events(title, event_date, start_time)")
    .in("status", ["pending", "reminding"])
    .lte("reminder_at", new Date(now).toISOString());

  if (error) return json({ error: "Unable to load reminders" }, 500);
  const reminders = (data || []) as Reminder[];
  const due = reminders.filter((reminder) => shouldSend(reminder, now));
  if (!due.length) return json({ sent: 0 });

  let accessToken: string;
  try {
    accessToken = await getAccessToken(config);
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to connect to WeCom" }, 502);
  }

  let sent = 0;
  for (const reminder of due) {
    try {
      await sendReminder(accessToken, config, reminder);
      const { error: updateError } = await supabase.from("wecom_reminders").update({
        status: "reminding",
        last_sent_at: new Date().toISOString(),
        sent_count: reminder.sent_count + 1,
        updated_at: new Date().toISOString(),
      }).eq("event_id", reminder.event_id);
      if (updateError) throw updateError;
      sent += 1;
    } catch (error) {
      console.error("Unable to send reminder", { eventId: reminder.event_id, error });
    }
  }

  return json({ sent });
});

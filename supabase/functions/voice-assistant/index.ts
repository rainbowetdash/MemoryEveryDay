import { createClient } from "npm:@supabase/supabase-js@2";

type Provider = "deepseek" | "openai";

type ParsedItem = {
  kind: "event" | "todo";
  title: string;
  note: string;
  date: string;
  start_time: string;
  end_time: string | null;
  group_id: string | null;
  color: string;
};

type ParsedPlan = {
  items: ParsedItem[];
  message: string;
};

const DAILY_LIMIT = 10;
const allowedOrigins = new Set([
  "https://memoryeveryday.pages.dev",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const colors = new Set(["blue", "navy", "cyan", "mint", "purple", "pink", "coral", "yellow", "green"]);
const dateSignal = /(今天|明天|后天|大后天|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}[月/]\d{1,2}([日号])?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[:：点时]\d{0,2}|上午|中午|下午|傍晚|晚上|凌晨|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s?(am|pm))/i;
const actionSignal = /(待办|日程|安排|提醒|课程|上课|会议|作业|任务|复习|整理|完成|提交|截止|预约|考试|学习|写|做|去|买|读|看|交|打电话|schedule|todo|task|remind|class|meeting|homework|review|study|finish|submit|appointment|exam|go|buy|read|write|call)/i;
const explicitSignal = /(创建|新增|添加|记下|帮我安排|加入日程|加入待办|create|add|put on my calendar)/i;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://memoryeveryday.pages.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function hasScheduleIntent(text: string) {
  return explicitSignal.test(text) || (dateSignal.test(text) && actionSignal.test(text));
}

function safeTimezone(value: unknown) {
  const timezone = String(value || "UTC").slice(0, 80);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

function localDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function localNow(timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizedPlan(value: unknown, groups: Array<{ id: string; color: string }>): ParsedPlan {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const groupMap = new Map(groups.map((group) => [group.id, colors.has(group.color) ? group.color : "blue"]));
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 8).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const title = String(item.title || "").trim().slice(0, 60);
    const date = String(item.date || "").trim();
    const startTime = String(item.start_time || "").trim();
    const rawEndTime = item.end_time == null ? "" : String(item.end_time).trim();
    if (!title || !validDate(date) || !validTime(startTime)) return [];
    const endTime = validTime(rawEndTime) && rawEndTime > startTime ? rawEndTime : null;
    const requestedGroup = item.group_id == null ? null : String(item.group_id);
    const groupId = requestedGroup && groupMap.has(requestedGroup) ? requestedGroup : null;
    const requestedColor = String(item.color || "blue");
    const color = groupId ? groupMap.get(groupId) || "blue" : colors.has(requestedColor) ? requestedColor : "blue";
    return [{
      kind: item.kind === "event" ? "event" as const : "todo" as const,
      title,
      note: String(item.note || "").trim().slice(0, 140),
      date,
      start_time: startTime,
      end_time: endTime,
      group_id: groupId,
      color,
    }];
  });
  return { items, message: String(raw.message || "").trim().slice(0, 120) };
}

const planSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["event", "todo"] },
          title: { type: "string", minLength: 1, maxLength: 60 },
          note: { type: "string", maxLength: 140 },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          start_time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
          end_time: { type: ["string", "null"] },
          group_id: { type: ["string", "null"] },
          color: { type: "string", enum: [...colors] },
        },
        required: ["kind", "title", "note", "date", "start_time", "end_time", "group_id", "color"],
      },
    },
    message: { type: "string", maxLength: 120 },
  },
  required: ["items", "message"],
} as const;

function modelInput(text: string, timezone: string, locale: string, groups: Array<{ id: string; name: string; color: string }>) {
  const groupDescription = groups.length
    ? groups.map((group) => `${group.id}=${group.name}`).join("；")
    : "没有可用日程表，group_id 必须为 null";
  const instructions = [
    "你是 MemoryEveryDay 的安排提取器，只把用户明确表达的未来或当天安排转换成 JSON，不聊天、不回答知识问题。",
    "默认创建 todo；只有用户明确说日程、会议、上课、课程、预约、考试等时间占用型事项时才用 event。",
    "每个独立事项生成一项。标题简洁，备注只保留必要上下文。不得补造用户未表达的事项。",
    "必须把相对日期换算为 YYYY-MM-DD，把时间换算为 24 小时 HH:mm。没有明确日期或开始时间的事项不要创建，并在 message 中用一句话请用户补充。",
    "有明确结束时间才填写 end_time，否则为 null。只有语义明确匹配已有日程表时填写 group_id，否则为 null。",
    `当前用户本地时间：${localNow(timezone)}；时区：${timezone}；界面语言：${locale || "zh-CN"}。`,
    `已有日程表：${groupDescription}。`,
  ].join("\n");
  return [
    { role: "system", content: instructions },
    { role: "user", content: text },
  ];
}

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") return String((part as Record<string, unknown>).text);
    }
  }
  return "";
}

async function requestPlan(provider: Provider, text: string, timezone: string, locale: string, groups: Array<{ id: string; name: string; color: string }>) {
  const openAI = provider === "openai";
  const apiKey = Deno.env.get(openAI ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("not_configured");
  const endpoint = openAI ? "https://api.openai.com/v1/responses" : "https://api.deepseek.com/responses";
  const model = Deno.env.get(openAI ? "OPENAI_VOICE_MODEL" : "DEEPSEEK_VOICE_MODEL") || (openAI ? "gpt-5.6-luna" : "deepseek-v4-flash");
  const format: Record<string, unknown> = { type: "json_schema", name: "memory_everyday_plan", schema: planSchema };
  if (openAI) format.strict = true;
  const body: Record<string, unknown> = {
    model,
    input: modelInput(text, timezone, locale, groups),
    text: openAI ? { format, verbosity: "low" } : { format },
    max_output_tokens: 1400,
    store: false,
    reasoning: { effort: "none" },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    console.error("Voice assistant provider error", { provider, status: response.status, payload });
    throw new Error(response.status === 401 ? "provider_auth_failed" : "provider_failed");
  }
  const content = responseText(payload);
  if (!content) throw new Error("empty_provider_response");
  try {
    return normalizedPlan(JSON.parse(content), groups);
  } catch {
    throw new Error("invalid_provider_response");
  }
}

function eventResult(row: Record<string, unknown>) {
  const kind = row.item_type === "todo" ? "todo" : "event";
  return {
    id: row.id,
    title: row.title,
    note: row.note || "",
    kind,
    completedAt: "",
    date: row.event_date,
    time: String(row.start_time || "").slice(0, 5),
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : "",
    mode: row.mode,
    color: row.color,
    groupId: row.group_id || "all",
    pushReminder: false,
    earlyReminders: [],
    weeklyDays: [],
    repeatStartDate: row.event_date,
    repeatEndDate: "",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (!['GET', 'POST'].includes(request.method)) return json(request, { code: "method_not_allowed", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(request, { code: "service_unavailable", message: "语音助手暂时不可用，请稍后再试。" }, 503);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return json(request, { code: "unauthorized", message: "请先登录 MemoryEveryDay 账号。" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const url = new URL(request.url);
  const timezone = safeTimezone(request.method === "GET" ? url.searchParams.get("timezone") : undefined);

  if (request.method === "GET") {
    const usageDate = localDate(timezone);
    const { data } = await admin.from("voice_assistant_daily_usage").select("request_count").eq("user_id", user.id).eq("usage_date", usageDate).maybeSingle();
    const used = Number(data?.request_count || 0);
    return json(request, {
      configured: { deepseek: Boolean(Deno.env.get("DEEPSEEK_API_KEY")), openai: Boolean(Deno.env.get("OPENAI_API_KEY")) },
      limit: DAILY_LIMIT,
      used,
      remaining: Math.max(0, DAILY_LIMIT - used),
      usageDate,
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(request, { code: "invalid_request", message: "没有收到可处理的安排。" }, 400);
  }
  const text = String(body.text || "").trim().slice(0, 600);
  const provider: Provider = body.provider === "openai" ? "openai" : "deepseek";
  const requestId = String(body.requestId || "");
  const locale = String(body.locale || "zh-CN").slice(0, 30);
  const requestTimezone = safeTimezone(body.timezone);
  const usageDate = localDate(requestTimezone);
  if (!text || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return json(request, { code: "invalid_request", message: "没有收到完整的语音内容，请重新说一次。" }, 400);
  }
  if (!hasScheduleIntent(text)) {
    return json(request, { code: "out_of_scope", message: "语音助手只负责创建日程、待办和每日安排，这段内容不会交给 AI。" }, 422);
  }
  const configured = provider === "openai" ? Boolean(Deno.env.get("OPENAI_API_KEY")) : Boolean(Deno.env.get("DEEPSEEK_API_KEY"));
  if (!configured) return json(request, { code: "not_configured", message: `${provider === "openai" ? "ChatGPT" : "DeepSeek"} 服务尚未启用，密钥配置后即可使用。` }, 503);

  const { data: existing } = await admin.from("voice_assistant_requests").select("status, result, error_code").eq("user_id", user.id).eq("request_id", requestId).maybeSingle();
  if (existing?.status === "completed" && existing.result) return json(request, { ...(existing.result as Record<string, unknown>), duplicate: true });
  if (existing) return json(request, { code: existing.error_code || "request_in_progress", message: "这次安排正在处理中，请稍后查看日程。" }, 409);

  const { error: requestError } = await admin.from("voice_assistant_requests").insert({
    user_id: user.id,
    request_id: requestId,
    usage_date: usageDate,
    provider,
  });
  if (requestError) return json(request, { code: "request_conflict", message: "这次安排已经提交，请稍后查看日程。" }, 409);

  const { data: quotaRows, error: quotaError } = await admin.rpc("claim_voice_assistant_usage", {
    p_user_id: user.id,
    p_usage_date: usageDate,
    p_timezone: requestTimezone,
    p_limit: DAILY_LIMIT,
  });
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
  if (quotaError || !quota?.allowed) {
    await admin.from("voice_assistant_requests").update({ status: "rejected", error_code: "daily_limit", completed_at: new Date().toISOString() }).eq("user_id", user.id).eq("request_id", requestId);
    return json(request, { code: "daily_limit", message: "今天的 10 次语音助手额度已经用完，明天会自动恢复。", remaining: 0 }, 429);
  }

  try {
    const { data: groupRows, error: groupError } = await admin.from("schedule_groups").select("id, name, color").eq("user_id", user.id).order("created_at");
    if (groupError) throw new Error("group_load_failed");
    const groups = (groupRows || []).map((group) => ({ id: String(group.id), name: String(group.name), color: String(group.color || "blue") }));
    const plan = await requestPlan(provider, text, requestTimezone, locale, groups);
    if (!plan.items.length) {
      const result = { created: 0, events: [], message: plan.message || "我听到了安排，但缺少明确的日期或开始时间，请补充后再试。", remaining: Number(quota.remaining), used: Number(quota.used), limit: DAILY_LIMIT };
      await admin.from("voice_assistant_requests").update({ status: "completed", item_count: 0, result, completed_at: new Date().toISOString() }).eq("user_id", user.id).eq("request_id", requestId);
      return json(request, result);
    }

    const rows = plan.items.map((item) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      title: item.title,
      note: item.note,
      item_type: item.kind,
      completed_at: null,
      event_date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      mode: item.end_time ? "range" : "reminder",
      color: item.color,
      group_id: item.group_id,
      push_reminder: false,
      wecom_reminder: false,
      early_reminders: [],
      repeat_weekdays: [],
      repeat_start_date: item.date,
      repeat_end_date: null,
      reminder_at: null,
    }));
    const { data: savedRows, error: insertError } = await admin.from("schedule_events").insert(rows).select("*");
    if (insertError) throw new Error("event_insert_failed");
    const events = (savedRows || []).map((row) => eventResult(row as Record<string, unknown>));
    const result = {
      created: events.length,
      events,
      message: plan.message || `已创建 ${events.length} 项安排。`,
      remaining: Number(quota.remaining),
      used: Number(quota.used),
      limit: DAILY_LIMIT,
    };
    await admin.from("voice_assistant_requests").update({
      status: "completed",
      item_count: events.length,
      event_ids: events.map((event) => event.id),
      result,
      completed_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("request_id", requestId);
    return json(request, result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "assistant_failed";
    console.error("Voice assistant request failed", { userId: user.id, provider, code });
    await admin.from("voice_assistant_requests").update({ status: "failed", error_code: code, completed_at: new Date().toISOString() }).eq("user_id", user.id).eq("request_id", requestId);
    const message = code === "provider_auth_failed" ? "AI 密钥无效，请更新服务配置。" : "这次安排没有创建成功，请稍后再试。";
    return json(request, { code, message, remaining: Number(quota.remaining), used: Number(quota.used), limit: DAILY_LIMIT }, 502);
  }
});

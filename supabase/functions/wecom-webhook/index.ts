import CryptoJS from "npm:crypto-js@4.2.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type WeComConfig = {
  token: string;
  encodingAesKey: string;
  corpId: string;
};

type WordArray = {
  sigBytes: number;
  words: number[];
};

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function wordArrayBytes(value: WordArray) {
  const bytes = new Uint8Array(value.sigBytes);
  for (let index = 0; index < value.sigBytes; index += 1) {
    bytes[index] = (value.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
  }
  return bytes;
}

function xmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1] || match?.[2] || "";
}

async function sha1(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signatureIsValid(config: WeComConfig, timestamp: string, nonce: string, encrypted: string, signature: string) {
  const expected = await sha1([config.token, timestamp, nonce, encrypted].sort().join(""));
  return expected === signature;
}

async function decryptWeComMessage(config: WeComConfig, encrypted: string) {
  const aesKey = CryptoJS.enc.Base64.parse(`${config.encodingAesKey}=`);
  if (aesKey.sigBytes !== 32) throw new Error("Invalid EncodingAESKey");

  const ciphertext = CryptoJS.enc.Base64.parse(encrypted.replace(/ /g, "+"));
  const iv = CryptoJS.lib.WordArray.create(aesKey.words.slice(0, 4), 16);
  const decrypted = wordArrayBytes(CryptoJS.AES.decrypt(
    { ciphertext },
    aesKey,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding },
  ));
  const padding = decrypted.at(-1) || 0;
  if (padding < 1 || padding > 32) throw new Error("Invalid message padding");

  const content = decrypted.slice(0, -padding);
  const messageLength = new DataView(content.buffer, content.byteOffset, content.byteLength).getUint32(16, false);
  const message = decoder.decode(content.slice(20, 20 + messageLength));
  const corpId = decoder.decode(content.slice(20 + messageLength));
  if (corpId !== config.corpId) throw new Error("Unexpected CorpID");
  return message;
}

function configFromEnvironment(): WeComConfig | null {
  const token = Deno.env.get("WECOM_TOKEN");
  const encodingAesKey = Deno.env.get("WECOM_ENCODING_AES_KEY");
  const corpId = Deno.env.get("WECOM_CORP_ID");
  return token && encodingAesKey && corpId ? { token, encodingAesKey, corpId } : null;
}

async function acknowledgeActiveReminders(fromUser: string) {
  const recipientUserId = Deno.env.get("WECOM_RECIPIENT_USER_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!fromUser || (recipientUserId && fromUser !== recipientUserId) || !supabaseUrl || !serviceRoleKey) return;

  const now = new Date().toISOString();
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabase.from("wecom_reminders").update({
    status: "acknowledged",
    acknowledged_at: now,
    acknowledged_by: fromUser,
    updated_at: now,
  }).eq("status", "reminding");
  if (error) throw error;
}

Deno.serve(async (request) => {
  const config = configFromEnvironment();
  if (!config) return text("WeCom callback is not configured", 503);

  const url = new URL(request.url);
  const signature = url.searchParams.get("msg_signature") || "";
  const timestamp = url.searchParams.get("timestamp") || "";
  const nonce = url.searchParams.get("nonce") || "";

  try {
    if (request.method === "GET") {
      const encrypted = url.searchParams.get("echostr") || "";
      if (!encrypted || !await signatureIsValid(config, timestamp, nonce, encrypted, signature)) return text("Invalid signature", 401);
      return text(await decryptWeComMessage(config, encrypted));
    }

    if (request.method !== "POST") return text("Method not allowed", 405);

    const body = await request.text();
    const encrypted = xmlValue(body, "Encrypt");
    if (!encrypted || !await signatureIsValid(config, timestamp, nonce, encrypted, signature)) return text("Invalid signature", 401);

    const message = await decryptWeComMessage(config, encrypted);
    const fromUser = xmlValue(message, "FromUserName");
    const content = xmlValue(message, "Content").trim();
    console.info("Verified WeCom reply", { fromUser, hasContent: Boolean(content) });

    try {
      await acknowledgeActiveReminders(fromUser);
    } catch (error) {
      console.error("Unable to acknowledge WeCom reminders", error);
    }
    return text("success");
  } catch (error) {
    console.error("WeCom callback failed", error);
    return text("Invalid callback", 400);
  }
});

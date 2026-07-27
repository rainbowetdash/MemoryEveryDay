const encoder = new TextEncoder();
const decoder = new TextDecoder();

type WeComConfig = {
  token: string;
  encodingAesKey: string;
  corpId: string;
};

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function base64Bytes(value: string) {
  const binary = atob(value.replace(/ /g, "+"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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
  const keyBytes = base64Bytes(`${config.encodingAesKey}=`);
  if (keyBytes.length !== 32) throw new Error("Invalid EncodingAESKey");

  const aesKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: keyBytes.slice(0, 16) }, aesKey, base64Bytes(encrypted)));
  const messageLength = new DataView(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength).getUint32(16, false);
  const message = decoder.decode(decrypted.slice(20, 20 + messageLength));
  const corpId = decoder.decode(decrypted.slice(20 + messageLength));
  if (corpId !== config.corpId) throw new Error("Unexpected CorpID");
  return message;
}

function configFromEnvironment(): WeComConfig | null {
  const token = Deno.env.get("WECOM_TOKEN");
  const encodingAesKey = Deno.env.get("WECOM_ENCODING_AES_KEY");
  const corpId = Deno.env.get("WECOM_CORP_ID");
  return token && encodingAesKey && corpId ? { token, encodingAesKey, corpId } : null;
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

    // The reminder workflow will use this verified reply to end the active reminder.
    return text("success");
  } catch (error) {
    console.error("WeCom callback failed", error);
    return text("Invalid callback", 400);
  }
});

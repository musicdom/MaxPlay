const crypto = require("node:crypto");
const { createClient } = require("redis");

let redisClient;
let redisConnectPromise;

const AGREEMENT_VERSION = process.env.USER_AGREEMENT_VERSION || "1.0.0";
const PRIVACY_VERSION = process.env.PRIVACY_POLICY_VERSION || "1.0.0";
const LEGAL_BASE_URL = process.env.LEGAL_BASE_URL || "https://musicdom.github.io/MaxPlay/legal";

async function getRedis() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not configured");
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 250, 5000) }
    });
    redisClient.on("error", (error) => console.error("[redis]", error.message));
  }
  if (!redisClient.isOpen) {
    if (!redisConnectPromise) {
      redisConnectPromise = redisClient.connect().finally(() => { redisConnectPromise = null; });
    }
    await redisConnectPromise;
  }
  return redisClient;
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    isBase64Encoded: false,
    body: JSON.stringify(payload)
  };
}

function getRequestPath(event) {
  const rawPath = event.path || event.rawPath || event.url || "/";
  const path = String(rawPath).split("?")[0];
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function parseBody(event) {
  const body = event.body;
  if (body === undefined || body === null || body === "") return {};
  if (typeof body === "object") return body;
  const raw = event.isBase64Encoded
    ? Buffer.from(String(body), "base64").toString("utf8")
    : String(body);
  try { return JSON.parse(raw); } catch { throw new Error("Request body must be valid JSON"); }
}

function extractWebAppData(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let source = value.trim();
  if (source.includes("#")) source = source.slice(source.indexOf("#") + 1);

  if (source.startsWith("WebAppData=") || source.includes("&WebAppData=")) {
    const outer = new URLSearchParams(source);
    const values = outer.getAll("WebAppData");
    if (values.length !== 1) return null;
    source = values[0];
  }
  return source;
}

function validateMaxInitData(initData, botToken) {
  const appData = extractWebAppData(initData);
  if (!appData || !botToken) return { ok: false, reason: "missing_data" };

  const params = new URLSearchParams(appData);
  const entries = [...params.entries()];
  const seen = new Set();
  for (const [key] of entries) {
    if (seen.has(key)) return { ok: false, reason: "duplicate_parameter" };
    seen.add(key);
  }

  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return { ok: false, reason: "missing_hash" };
  }

  const launchParams = entries
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  // MAX WebAppData signature algorithm from the official validation guide.
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken, "utf8").digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(launchParams, "utf8").digest();
  const actualHash = Buffer.from(receivedHash, "hex");
  if (actualHash.length !== expectedHash.length || !crypto.timingSafeEqual(actualHash, expectedHash)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: "invalid_auth_date" };
  const now = Math.floor(Date.now() / 1000);
  const maxAge = Number(process.env.MAX_AUTH_MAX_AGE_SECONDS || 86400);
  if (authDate > now + 60 || now - authDate > maxAge) {
    return { ok: false, reason: "auth_data_expired" };
  }

  let user;
  try { user = JSON.parse(params.get("user") || "null"); } catch {
    return { ok: false, reason: "invalid_user" };
  }
  if (!user || (typeof user.id !== "number" && typeof user.id !== "string")) {
    return { ok: false, reason: "invalid_user" };
  }
  const userId = String(user.id);
  if (!/^\d+$/.test(userId)) return { ok: false, reason: "invalid_user" };

  return {
    ok: true,
    user: {
      id: userId,
      firstName: typeof user.first_name === "string" ? user.first_name : "",
      lastName: typeof user.last_name === "string" ? user.last_name : "",
      username: typeof user.username === "string" ? user.username : null,
      languageCode: typeof user.language_code === "string" ? user.language_code : null,
      photoUrl: typeof user.photo_url === "string" ? user.photo_url : null
    },
    authDate
  };
}

async function saveUser(user) {
  const client = await getRedis();
  const key = "user:" + user.id;
  const existingRaw = await client.get(key);
  let createdAt = new Date().toISOString();
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      if (typeof existing.createdAt === "string") createdAt = existing.createdAt;
    } catch {}
  }
  const record = { ...user, createdAt, updatedAt: new Date().toISOString() };
  await client.set(key, JSON.stringify(record));
  return record;
}

function currentConsentVersions() {
  return { agreement: AGREEMENT_VERSION, privacy: PRIVACY_VERSION };
}

async function getConsent(userId) {
  const client = await getRedis();
  const raw = await client.get("consent:" + userId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function consentIsCurrent(consent) {
  return Boolean(consent &&
    consent.agreementVersion === AGREEMENT_VERSION &&
    consent.privacyVersion === PRIVACY_VERSION);
}

async function saveConsent(userId, source) {
  const client = await getRedis();
  const record = {
    userId: String(userId),
    agreementVersion: AGREEMENT_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt: new Date().toISOString(),
    source
  };
  await client.set("consent:" + userId, JSON.stringify(record));
  return record;
}

function headerValue(headers = {}, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return "";
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function sendMaxMessage(userId, text, buttons = []) {
  if (!process.env.MAX_BOT_TOKEN) throw new Error("MAX_BOT_TOKEN is not configured");
  const url = "https://platform-api2.max.ru/messages?user_id=" + encodeURIComponent(String(userId));
  const result = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": process.env.MAX_BOT_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      attachments: buttons.length ? [{ type: "inline_keyboard", payload: { buttons } }] : []
    })
  });
  if (!result.ok) {
    const detail = await result.text().catch(() => "");
    throw new Error("MAX send message failed (" + result.status + "): " + detail.slice(0, 300));
  }
}

function legalButtons() {
  const rows = [
    [{ type: "link", text: "Пользовательское соглашение", url: LEGAL_BASE_URL + "/user-agreement.html" }],
    [{ type: "link", text: "Политика конфиденциальности", url: LEGAL_BASE_URL + "/privacy-policy.html" }],
    [{ type: "callback", text: "Принимаю оба документа", payload: "podaris:consent:accept:v1" }]
  ];
  if (process.env.MAX_MINI_APP_URL) {
    rows.push([{ type: "open_app", text: "Открыть Подарис и принять", web_app: process.env.MAX_MINI_APP_URL }]);
  }
  return rows;
}

async function sendConsentPrompt(userId) {
  await sendMaxMessage(
    userId,
    "Добро пожаловать в Подарис! Чтобы пользоваться приложением, сначала ознакомьтесь с документами и подтвердите согласие с обоими. Если вы уже принимали текущие редакции, просто откройте приложение.",
    legalButtons()
  );
}

async function handleMaxUpdate(update) {
  const type = update.update_type;
  const user = update.user || update.callback?.user || update.message?.sender || {};
  const userId = user.user_id ?? user.id;
  if (userId === undefined || userId === null) return;

  const id = String(userId);
  const current = await getConsent(id);

  if (type === "bot_started") {
    if (consentIsCurrent(current)) {
      const buttons = process.env.MAX_MINI_APP_URL
        ? [[{ type: "open_app", text: "Открыть Подарис", web_app: process.env.MAX_MINI_APP_URL }]]
        : [];
      await sendMaxMessage(id, "Вы уже приняли действующие документы. Можно открыть Подарис.", buttons);
    } else {
      await sendConsentPrompt(id);
    }
    return;
  }

  if (type === "message_created") {
    const text = String(update.message?.body?.text || update.message?.text || "").trim();
    if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      if (consentIsCurrent(current)) {
        const buttons = process.env.MAX_MINI_APP_URL
          ? [[{ type: "open_app", text: "Открыть Подарис", web_app: process.env.MAX_MINI_APP_URL }]]
          : [];
        await sendMaxMessage(id, "Вы уже приняли действующие документы. Можно открыть Подарис.", buttons);
      } else {
        await sendConsentPrompt(id);
      }
    }
    return;
  }

  if (type === "message_callback" && update.callback?.payload === "podaris:consent:accept:v1") {
    await saveConsent(id, "bot");
    const buttons = process.env.MAX_MINI_APP_URL
      ? [[{ type: "open_app", text: "Открыть Подарис", web_app: process.env.MAX_MINI_APP_URL }]]
      : [];
    await sendMaxMessage(id, "Согласие сохранено. Теперь вам доступно приложение Подарис.", buttons);
  }
}

// Yandex Cloud Functions Node.js 22 HTTP handler. Entry point: handler.handler
module.exports.handler = async function (event = {}) {
  const method = String(event.httpMethod || event.requestContext?.httpMethod || event.method || "GET").toUpperCase();
  const path = getRequestPath(event);
  if (method === "OPTIONS") return response(204, {});

  let body;
  try { body = parseBody(event); } catch {
    return response(400, { error: "invalid_json" });
  }

  if (method === "GET" && path === "/api/config") {
    return response(200, {
      appName: "Подарис",
      platform: "MAX",
      apiBase: "/api",
      legal: {
        agreementVersion: AGREEMENT_VERSION,
        privacyVersion: PRIVACY_VERSION,
        agreementUrl: LEGAL_BASE_URL + "/user-agreement.html",
        privacyUrl: LEGAL_BASE_URL + "/privacy-policy.html"
      }
    });
  }

  if (method === "GET" && path === "/api/health") {
    try {
      const client = await getRedis();
      await client.ping();
      return response(200, {
        ok: true, service: "podaris-api", runtime: "yandex-cloud-functions",
        redis: "ok", maxBotConfigured: Boolean(process.env.MAX_BOT_TOKEN),
        webhookSecretConfigured: Boolean(process.env.MAX_WEBHOOK_SECRET),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[health check]", error.message);
      return response(503, {
        ok: false, service: "podaris-api",
        redis: process.env.REDIS_URL ? "unavailable" : "not_configured",
        maxBotConfigured: Boolean(process.env.MAX_BOT_TOKEN)
      });
    }
  }

  if (method === "POST" && ["/api/auth", "/api/consent/status", "/api/consent/accept"].includes(path)) {
    if (!process.env.MAX_BOT_TOKEN) return response(503, { error: "max_bot_not_configured" });
    const auth = validateMaxInitData(body?.initData, process.env.MAX_BOT_TOKEN);
    if (!auth.ok) return response(401, { error: "unauthorized", reason: auth.reason });

    try {
      const user = await saveUser(auth.user);
      if (path === "/api/auth") {
        const consent = await getConsent(user.id);
        return response(200, { ok: true, user, consentRequired: !consentIsCurrent(consent) });
      }

      if (path === "/api/consent/status") {
        const consent = await getConsent(user.id);
        return response(200, {
          ok: true,
          accepted: consentIsCurrent(consent),
          required: !consentIsCurrent(consent),
          versions: currentConsentVersions(),
          legal: {
            agreementUrl: LEGAL_BASE_URL + "/user-agreement.html",
            privacyUrl: LEGAL_BASE_URL + "/privacy-policy.html"
          },
          user,
          consent: consentIsCurrent(consent) ? consent : null
        });
      }

      if (body?.agreementAccepted !== true || body?.privacyAccepted !== true) {
        return response(400, { error: "both_documents_must_be_accepted" });
      }
      const consent = await saveConsent(user.id, "mini_app");
      return response(200, { ok: true, accepted: true, consent });
    } catch (error) {
      console.error("[consent]", error.message);
      return response(503, { error: "storage_unavailable" });
    }
  }

  if (method === "POST" && path === "/api/max/webhook") {
    const suppliedSecret = headerValue(event.headers, "X-Max-Bot-Api-Secret");
    if (!safeEqual(suppliedSecret, process.env.MAX_WEBHOOK_SECRET)) {
      return response(401, { error: "invalid_webhook_secret" });
    }
    try {
      await handleMaxUpdate(body);
      return response(200, { ok: true });
    } catch (error) {
      console.error("[MAX webhook]", error.message);
      return response(500, { error: "webhook_processing_failed" });
    }
  }

  return response(404, { error: "not_found" });
};

const crypto = require("node:crypto");
// Upstash Redis REST adapter. Credentials are supplied only through Yandex
// Cloud Function environment variables; no Redis secrets belong in the repository.
function createUpstashClient() {
  const endpoint = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!endpoint || !token) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");

  async function command(parts) {
    const result = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(parts)
    });
    if (!result.ok) throw new Error("Upstash Redis request failed (" + result.status + ")");
    const payload = await result.json();
    if (payload.error) throw new Error("Upstash Redis command failed: " + String(payload.error).slice(0, 200));
    return payload.result;
  }

  return {
    get: async (key) => command(["GET", key]),
    set: async (key, value) => command(["SET", key, value]),
    del: async (key) => command(["DEL", key]),
    decr: async (key) => Number(await command(["DECR", key])),
    incr: async (key) => Number(await command(["INCR", key])),
    lRange: async (key, start, stop) => (await command(["LRANGE", key, start, stop])) || [],
    lRem: async (key, count, value) => Number(await command(["LREM", key, count, value])),
    rPush: async (key, value) => Number(await command(["RPUSH", key, value])),
    pExpireAt: async (key, timestamp) => Number(await command(["PEXPIREAT", key, timestamp])),
    ping: async () => command(["PING"])
  };
}

let redisClient;

const AGREEMENT_VERSION = process.env.USER_AGREEMENT_VERSION || "1.0.0";
const PRIVACY_VERSION = process.env.PRIVACY_POLICY_VERSION || "1.0.0";
const LEGAL_BASE_URL = process.env.LEGAL_BASE_URL || "https://musicdom.github.io/MaxPlay/legal";

async function getRedis() {
  if (!redisClient) redisClient = createUpstashClient();
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

function getQueryParameters(event) {
  if (event.queryStringParameters && typeof event.queryStringParameters === "object") {
    return event.queryStringParameters;
  }
  const raw = event.rawQueryString || event.query || "";
  return Object.fromEntries(new URLSearchParams(String(raw).replace(/^\?/, "")));
}

function getRequestPath(event) {
  // One Yandex function root, with route selection through query parameters (Norka pattern).
  const query = getQueryParameters(event);
  const route = String(query.route || "").toLowerCase();
  if (route === "health") return "/api/health";
  if (route === "config") return "/api/config";
  if (route === "webhook") return "/api/max/webhook";
  if (route === "api") {
    const endpoint = String(query.endpoint || "").replace(/^\/+|\/+$/g, "");
    if (!endpoint || !/^[a-z0-9/_-]+$/i.test(endpoint) || endpoint.includes("..")) return "/__invalid_route__";
    return "/api/" + endpoint;
  }

  // Keep path-based calls compatible where the HTTP trigger provides a path.
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
  let existing = {};
  if (existingRaw) {
    try { existing = JSON.parse(existingRaw) || {}; } catch {}
  }
  const record = {
    ...existing,
    ...user,
    firstName: user.firstName || existing.firstName || "",
    lastName: user.lastName || existing.lastName || "",
    username: user.username || existing.username || null,
    languageCode: user.languageCode || existing.languageCode || null,
    photoUrl: user.photoUrl || existing.photoUrl || null,
    createdAt,
    updatedAt: new Date().toISOString()
  };
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

function consentCallbackPayload() {
  return "podaris:consent:accept:" + AGREEMENT_VERSION + ":" + PRIVACY_VERSION;
}

function legalButtons() {
  const rows = [
    [{ type: "link", text: "Пользовательское соглашение", url: LEGAL_BASE_URL + "/user-agreement.html" }],
    [{ type: "link", text: "Политика конфиденциальности", url: LEGAL_BASE_URL + "/privacy-policy.html" }],
    [{ type: "callback", text: "Принимаю оба документа", payload: consentCallbackPayload() }]
  ];
  if (process.env.MAX_MINI_APP_URL) {
    rows.push([{ type: "open_app", text: "Открыть Подарис и принять", web_app: process.env.MAX_MINI_APP_URL }]);
  }
  return rows;
}

async function getSavedContact(userId) {
  const client = await getRedis();
  const raw = await client.get("contact:" + userId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function contactRequestButtons() {
  return [[{ type: "request_contact", text: "Поделиться контактом" }]];
}

async function sendContactPrompt(userId) {
  const existing = await getSavedContact(userId);
  if (existing?.phone) {
    const buttons = process.env.MAX_MINI_APP_URL
      ? [[{ type: "open_app", text: "Открыть Подарис", web_app: process.env.MAX_MINI_APP_URL }]]
      : [];
    await sendMaxMessage(userId, "Ваш контакт уже сохранён. Спасибо!", buttons);
    return;
  }
  await sendMaxMessage(
    userId,
    "Согласие сохранено. Для заполнения профиля вы можете отдельно поделиться контактом MAX. Это необязательно: можно пропустить этот шаг и пользоваться Подарисом без номера телефона.",
    contactRequestButtons()
  );
}

function decodeVcardValue(value) {
  return String(value || "").replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function parseVcard(vcfInfo) {
  const normalized = String(vcfInfo || "").replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n");
  const lines = normalized.split(/\r?\n/);
  const result = {};
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const key = line.slice(0, colon).split(";")[0].toUpperCase();
    const value = decodeVcardValue(line.slice(colon + 1));
    if (!value) continue;
    if (key === "TEL" && !result.phone) result.phone = value;
    if (key === "FN" && !result.fullName) result.fullName = value;
    if (key === "EMAIL" && !result.email) result.email = value;
    if (key === "URL" && !result.profileUrl) result.profileUrl = value;
  }
  return result;
}

function verifyContactHash(vcfInfo, receivedHash) {
  if (typeof vcfInfo !== "string" || typeof receivedHash !== "string" ||
      !process.env.MAX_BOT_TOKEN || !/^[a-f0-9]{64}$/i.test(receivedHash)) return false;
  const normalized = vcfInfo.replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n");
  const expected = crypto.createHmac("sha256", process.env.MAX_BOT_TOKEN)
    .update(normalized, "utf8").digest();
  const actual = Buffer.from(receivedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function saveSharedContact(userId, payload) {
  const vcfInfo = payload?.vcf_info;
  if (!verifyContactHash(vcfInfo, payload?.hash)) return false;
  const contact = parseVcard(vcfInfo);
  if (!contact.phone) return false;
  const record = {
    userId: String(userId),
    phone: contact.phone,
    fullName: contact.fullName || null,
    email: contact.email || null,
    profileUrl: contact.profileUrl || null,
    verifiedByMax: true,
    sharedAt: new Date().toISOString(),
    source: "max_request_contact"
  };
  const client = await getRedis();
  await client.set("contact:" + userId, JSON.stringify(record));
  await saveUser({ id: String(userId), phone: record.phone, fullAuthorizationAt: record.sharedAt });
  await ensureStarterGiftCredits(String(userId));
  return true;
}

async function sendConsentPrompt(userId) {
  await sendMaxMessage(
    userId,
    "Добро пожаловать в Подарис! Для работы приложения MAX передаёт доступные данные профиля: MAX ID, имя, фамилию, username, язык и фотографию профиля (если они доступны). Номер телефона и другие контактные сведения мы запросим отдельно — только если вы нажмёте «Поделиться контактом». Ознакомьтесь с документами и подтвердите согласие.",
    legalButtons()
  );
}

async function handleMaxUpdate(update) {
  const type = update.update_type;
  const user = update.user || update.callback?.user || update.message?.sender || {};
  const userId = user.user_id ?? user.id;
  if (userId === undefined || userId === null) return;

  const id = String(userId);
  await saveUser({
    id,
    firstName: typeof user.first_name === "string" ? user.first_name : "",
    lastName: typeof user.last_name === "string" ? user.last_name : "",
    username: typeof user.username === "string" ? user.username : null,
    languageCode: typeof update.user_locale === "string" ? update.user_locale : null,
    photoUrl: null
  });
  const current = await getConsent(id);

  if (type === "message_created") {
    const attachments = update.message?.body?.attachments || [];
    const contactAttachment = attachments.find((item) => item?.type === "contact");
    if (contactAttachment && consentIsCurrent(current)) {
      const payload = contactAttachment.payload || {};
      const maxInfoId = payload.max_info?.user_id;
      if (maxInfoId === undefined || String(maxInfoId) === id) {
        const saved = await saveSharedContact(id, payload);
        if (saved) {
          await sendMaxMessage(id, "Контакт MAX подтверждён и сохранён в вашем профиле Подариса. Спасибо!");
        } else {
          await sendMaxMessage(id, "Не удалось подтвердить контакт MAX. Нажмите кнопку «Поделиться контактом» в сообщении бота и попробуйте ещё раз.");
        }
      }
    }
  }

  if (type === "bot_started") {
    if (consentIsCurrent(current)) {
      const buttons = process.env.MAX_MINI_APP_URL
        ? [[{ type: "open_app", text: "Открыть Подарис", web_app: process.env.MAX_MINI_APP_URL }]]
        : [];
      await sendContactPrompt(id);
      if (buttons.length) await sendMaxMessage(id, "Вы уже приняли действующие документы. Можно открыть Подарис.", buttons);
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
        await sendContactPrompt(id);
        if (buttons.length) await sendMaxMessage(id, "Вы уже приняли действующие документы. Можно открыть Подарис.", buttons);
      } else {
        await sendConsentPrompt(id);
      }
    }
    return;
  }

  if (type === "message_callback" && typeof update.callback?.payload === "string" &&
      update.callback.payload.startsWith("podaris:consent:accept:")) {
    if (update.callback.payload !== consentCallbackPayload()) {
      await sendConsentPrompt(id);
      return;
    }
    await saveConsent(id, "bot");
    await sendContactPrompt(id);
    const buttons = process.env.MAX_MINI_APP_URL
      ? [[{ type: "open_app", text: "Открыть Подарис", web_app: process.env.MAX_MINI_APP_URL }]]
      : [];
    if (buttons.length) await sendMaxMessage(id, "Теперь вам доступно приложение Подарис.", buttons);
  }
}

async function isFullyAuthorized(userId) {
  const [consent, contact] = await Promise.all([getConsent(userId), getSavedContact(userId)]);
  return consentIsCurrent(consent) && Boolean(contact?.phone);
}

async function ensureStarterGiftCredits(userId) {
  const client = await getRedis();
  const key = "gift-credits:" + userId;
  await client.set(key, "3", { NX: true });
  return Number(await client.get(key) || 0);
}

async function getGiftBalance(userId) {
  const client = await getRedis();
  return Number(await client.get("gift-credits:" + userId) || 0);
}

async function readGift(giftId) {
  const client = await getRedis();
  const raw = await client.get("gift:" + giftId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveGift(gift) {
  const client = await getRedis();
  await client.set("gift:" + gift.id, JSON.stringify(gift));
  return gift;
}

async function listUserGifts(userId) {
  const client = await getRedis();
  const [receivedIds, sentIds] = await Promise.all([
    client.lRange("gifts:received:" + userId, 0, -1),
    client.lRange("gifts:sent:" + userId, 0, -1)
  ]);
  const [received, sent] = await Promise.all([
    Promise.all(receivedIds.map(readGift)),
    Promise.all(sentIds.map(readGift))
  ]);
  const now = Date.now();
  async function normalize(gift, giftId) {
    if (!gift) {
      await Promise.all([
        client.lRem("gifts:received:" + userId, 0, giftId),
        client.lRem("gifts:sent:" + userId, 0, giftId)
      ]);
      return null;
    }
    if (gift.status === "claimed" && gift.expiresAt && now >= gift.expiresAt) {
      await client.del("gift:" + gift.id);
      await Promise.all([
        client.lRem("gifts:received:" + gift.recipientId, 0, gift.id),
        client.lRem("gifts:sent:" + gift.senderId, 0, gift.id)
      ]);
      return null;
    }
    return gift;
  }
  return {
    received: (await Promise.all(received.map((gift, index) => normalize(gift, receivedIds[index])))).filter(Boolean),
    sent: (await Promise.all(sent.map((gift, index) => normalize(gift, sentIds[index])))).filter(Boolean)
  };
}

function giftError(statusCode, error, extra = {}) {
  return { statusCode, body: { ok: false, error, ...extra } };
}

async function handleGiftRequest(path, body, user) {
  const userId = user.id;
  const consent = await getConsent(userId);
  if (!consentIsCurrent(consent)) return giftError(403, "consent_required");
  const client = await getRedis();
  const fullyAuthorized = await isFullyAuthorized(userId);
  if (fullyAuthorized) await ensureStarterGiftCredits(userId);
  const balance = await getGiftBalance(userId);

  if (path === "/api/gifts/list") {
    const gifts = await listUserGifts(userId);
    return { statusCode: 200, body: {
      ok: true, fullyAuthorized, canSend: fullyAuthorized && balance > 0,
      canBuy: true, canViewReceived: true, canForward: fullyAuthorized,
      giftCredits: balance, gifts: { received: gifts.received, sent: fullyAuthorized ? gifts.sent : [] }
    }};
  }

  if (path === "/api/gifts/send") {
    if (!fullyAuthorized) return giftError(403, "full_authorization_required");
    const recipientId = String(body?.recipientId || "");
    const giftType = String(body?.giftType || "");
    const revealDelaySeconds = Number(body?.revealDelaySeconds ?? 0);
    if (!/^\d+$/.test(recipientId) || recipientId === userId) return giftError(400, "invalid_recipient");
    if (!["project", "family_heart", "friend"].includes(giftType)) return giftError(400, "invalid_gift_type");
    if (!Number.isInteger(revealDelaySeconds) || revealDelaySeconds < 0 || revealDelaySeconds > 30 * 24 * 60 * 60) {
      return giftError(400, "invalid_reveal_delay");
    }
    const remaining = await client.decr("gift-credits:" + userId);
    if (remaining < 0) {
      await client.incr("gift-credits:" + userId);
      return giftError(409, "no_free_gifts_remaining");
    }
    const now = Date.now();
    const gift = {
      id: crypto.randomUUID(),
      giftType,
      senderId: userId,
      recipientId,
      status: "sent",
      message: typeof body.message === "string" ? body.message.slice(0, 500) : "",
      revealDelaySeconds,
      createdAt: now,
      claimedAt: null,
      opensAt: null,
      expiresAt: null,
      openedAt: null,
      forwardedFrom: null,
      shareUrl: process.env.MAX_MINI_APP_URL
        ? process.env.MAX_MINI_APP_URL + (process.env.MAX_MINI_APP_URL.includes("?") ? "&" : "?") + "gift=" + crypto.randomUUID()
        : null
    };
    if (gift.shareUrl) gift.shareUrl = gift.shareUrl.slice(0, gift.shareUrl.lastIndexOf("=") + 1) + gift.id;
    try {
      await client.set("gift:" + gift.id, JSON.stringify(gift));
      await client.rPush("gifts:sent:" + userId, gift.id);
      await client.rPush("gifts:received:" + recipientId, gift.id);
    } catch (error) {
      await client.incr("gift-credits:" + userId);
      throw error;
    }
    let notificationSent = false;
    if (gift.shareUrl) {
      try {
        await sendMaxMessage(
          recipientId,
          "Вам отправили подарок в Подарис! Нажмите кнопку, чтобы забрать его. После получения начнётся таймер, а когда он закончится, у вас будет 12 часов, чтобы открыть подарок.",
          [[{ type: "open_app", text: "Получить подарок", web_app: gift.shareUrl }]]
        );
        notificationSent = true;
      } catch (error) {
        console.warn("[gift notification]", error.message);
      }
    }
    return { statusCode: 201, body: { ok: true, gift, giftCredits: remaining, notificationSent } };
  }

  if (path === "/api/gifts/claim" || path === "/api/gifts/open" || path === "/api/gifts/forward") {
    const giftId = String(body?.giftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(giftId)) return giftError(400, "invalid_gift_id");
    const gift = await readGift(giftId);
    if (!gift) return giftError(404, "gift_not_found");
    const now = Date.now();

    if (path === "/api/gifts/claim") {
      if (gift.recipientId !== userId) return giftError(403, "not_gift_recipient");
      if (gift.status === "claimed" || gift.status === "opened") {
        return { statusCode: 200, body: { ok: true, gift, alreadyClaimed: true } };
      }
      if (gift.status !== "sent") return giftError(409, "gift_not_claimable");
      gift.status = "claimed";
      gift.claimedAt = now;
      gift.opensAt = now + gift.revealDelaySeconds * 1000;
      gift.expiresAt = gift.opensAt + 12 * 60 * 60 * 1000;
      await saveGift(gift);
      await client.pExpireAt("gift:" + gift.id, gift.expiresAt);
      return { statusCode: 200, body: { ok: true, gift } };
    }

    if (path === "/api/gifts/open") {
      if (gift.recipientId !== userId) return giftError(403, "not_gift_recipient");
      if (gift.status === "claimed" && gift.expiresAt && now >= gift.expiresAt) {
        await client.del("gift:" + gift.id);
        await Promise.all([
          client.lRem("gifts:received:" + gift.recipientId, 0, gift.id),
          client.lRem("gifts:sent:" + gift.senderId, 0, gift.id)
        ]);
        return giftError(410, "gift_expired");
      }
      if (gift.status !== "claimed") return giftError(409, "gift_not_ready");
      if (now < gift.opensAt) return giftError(409, "gift_not_ready", { opensAt: gift.opensAt });
      gift.status = "opened";
      gift.openedAt = now;
      await saveGift(gift);
      return { statusCode: 200, body: { ok: true, gift } };
    }

    if (!fullyAuthorized) return giftError(403, "full_authorization_required");
    if (gift.recipientId !== userId) return giftError(403, "not_gift_recipient");
    if (gift.status !== "opened") return giftError(409, "gift_not_forwardable");
    const newRecipientId = String(body?.recipientId || "");
    if (!/^\d+$/.test(newRecipientId) || newRecipientId === userId) return giftError(400, "invalid_recipient");
    const forwarded = {
      ...gift,
      id: crypto.randomUUID(),
      senderId: userId,
      recipientId: newRecipientId,
      status: "sent",
      createdAt: now,
      claimedAt: null,
      opensAt: null,
      expiresAt: null,
      openedAt: null,
      forwardedFrom: gift.id,
      shareUrl: process.env.MAX_MINI_APP_URL
        ? process.env.MAX_MINI_APP_URL + (process.env.MAX_MINI_APP_URL.includes("?") ? "&" : "?") + "gift=" + crypto.randomUUID()
        : null
    };
    if (forwarded.shareUrl) forwarded.shareUrl = forwarded.shareUrl.slice(0, forwarded.shareUrl.lastIndexOf("=") + 1) + forwarded.id;
    gift.status = "forwarded";
    gift.forwardedAt = now;
    await saveGift(gift);
    await client.lRem("gifts:received:" + userId, 0, gift.id);
    await client.set("gift:" + forwarded.id, JSON.stringify(forwarded));
    await client.rPush("gifts:sent:" + userId, forwarded.id);
    await client.rPush("gifts:received:" + newRecipientId, forwarded.id);
    let notificationSent = false;
    if (forwarded.shareUrl) {
      try {
        await sendMaxMessage(
          newRecipientId,
          "Вам переслали открытый подарок в Подарис! Заберите его по кнопке ниже.",
          [[{ type: "open_app", text: "Получить подарок", web_app: forwarded.shareUrl }]]
        );
        notificationSent = true;
      } catch (error) {
        console.warn("[forward notification]", error.message);
      }
    }
    return { statusCode: 201, body: { ok: true, gift: forwarded, notificationSent } };
  }

  return giftError(404, "gift_route_not_found");
}


async function handleAdminStatus(body){
 const allowed=new Set(String(process.env.ADMIN_MAX_IDS||'').split(',').map(value=>value.trim()).filter(Boolean));
 if(!allowed.has(String(body?.__verifiedUserId||'')))return {statusCode:403,body:{error:'admin_access_denied'}};
 let redis='unavailable';
 try{const client=await getRedis();await client.ping();redis='ok';}catch(error){console.error('[admin redis]',error.message);}
 return {statusCode:200,body:{ok:true,isAdmin:true,userId:String(body.__verifiedUserId),redis,maxBotConfigured:Boolean(process.env.MAX_BOT_TOKEN),webhookSecretConfigured:Boolean(process.env.MAX_WEBHOOK_SECRET),checkedAt:new Date().toISOString()}};
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
        redis: process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? "unavailable" : "not_configured",
        maxBotConfigured: Boolean(process.env.MAX_BOT_TOKEN)
      });
    }
  }

  if (method === "POST" && ["/api/auth", "/api/consent/status", "/api/consent/accept", "/api/gifts/list", "/api/gifts/send", "/api/gifts/claim", "/api/gifts/open", "/api/gifts/forward", "/api/admin/status"].includes(path)) {
    if (!process.env.MAX_BOT_TOKEN) return response(503, { error: "max_bot_not_configured" });
    const auth = validateMaxInitData(body?.initData, process.env.MAX_BOT_TOKEN);
    if (!auth.ok) return response(401, { error: "unauthorized", reason: auth.reason });

    try {
      const user = await saveUser(auth.user);
      if (path === "/api/admin/status") {
        const adminResult = await handleAdminStatus({ __verifiedUserId: user.id });
        return response(adminResult.statusCode, adminResult.body);
      }
      if (path === "/api/auth") {
        const consent = await getConsent(user.id);
        const contact = await getSavedContact(user.id);
        const fullyAuthorized = consentIsCurrent(consent) && Boolean(contact?.phone);
        const giftCredits = fullyAuthorized ? await ensureStarterGiftCredits(user.id) : await getGiftBalance(user.id);
        return response(200, {
          ok: true, user, consentRequired: !consentIsCurrent(consent),
          fullyAuthorized, contactRequired: !contact?.phone, giftCredits
        });
      }
      if (path.startsWith("/api/gifts/")) {
        const consent = await getConsent(user.id);
        if (!consentIsCurrent(consent)) return response(403, { error: "consent_required" });
        const result = await handleGiftRequest(path, body, user);
        return response(result.statusCode, result.body);
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
      if (body?.agreementVersion !== AGREEMENT_VERSION || body?.privacyVersion !== PRIVACY_VERSION) {
        return response(409, { error: "legal_documents_updated" });
      }
      const consent = await saveConsent(user.id, "mini_app");
      try { await sendContactPrompt(user.id); }
      catch (messageError) { console.error("[contact prompt]", messageError.message); }
      return response(200, { ok: true, accepted: true, consent, contactRequestSent: true });
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

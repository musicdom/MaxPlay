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
    set: async (key, value, options = {}) => command(["SET", key, value, ...(options.nx ? ["NX"] : []), ...(options.px ? ["PX", String(options.px)] : [])]),
    del: async (key) => command(["DEL", key]),
    decr: async (key) => Number(await command(["DECR", key])),
    incr: async (key) => Number(await command(["INCR", key])),
    lRange: async (key, start, stop) => (await command(["LRANGE", key, start, stop])) || [],
    lRem: async (key, count, value) => Number(await command(["LREM", key, count, value])),
    rPush: async (key, value) => Number(await command(["RPUSH", key, value])),
    lTrim: async (key, start, stop) => command(["LTRIM", key, start, stop]),
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
  try { return JSON.parse(raw); } catch {
    const form = new URLSearchParams(raw);
    const entries = [...form.entries()];
    if (entries.length) return Object.fromEntries(entries);
    throw new Error("Request body must be valid JSON or form data");
  }
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
    await sendMaxMessage(userId, "Ваш номер телефона подтверждён. Полная авторизация завершена.", buttons);
    return;
  }
  const buttons = contactRequestButtons();
  if (process.env.MAX_MINI_APP_URL) {
    buttons.push([{ type: "open_app", text: "Открыть Подарис", web_app: process.env.MAX_MINI_APP_URL }]);
  }
  await sendMaxMessage(
    userId,
    "Документы приняты. Остался последний шаг: подтвердите профиль, поделившись номером телефона через MAX. Нажмите «Поделиться контактом». Без подтверждения номера приложение останется в ограниченном режиме.",
    buttons
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
    if (contactAttachment) {
      const payload = contactAttachment.payload || {};
      const maxInfoId = payload.max_info?.user_id;
      if (!consentIsCurrent(current)) {
        await recordAdminLog("warning", "contact", "Контакт получен до принятия документов", { userId: id });
        await sendConsentPrompt(id);
      } else if (maxInfoId !== undefined && String(maxInfoId) !== id) {
        await recordAdminLog("warning", "contact", "MAX contact user ID mismatch", { userId: id });
        await sendMaxMessage(id, "Не удалось подтвердить, что это ваш контакт. Нажмите кнопку «Поделиться контактом» в сообщении бота и попробуйте ещё раз.");
      } else {
        const saved = await saveSharedContact(id, payload);
        if (saved) {
          await recordAdminLog("info", "contact", "Номер телефона успешно подтверждён и сохранён", { userId: id });
          const buttons = process.env.MAX_MINI_APP_URL
            ? [[{ type: "open_app", text: "Открыть Подарис", web_app: process.env.MAX_MINI_APP_URL }]]
            : [];
          await sendMaxMessage(id, "Номер телефона подтверждён! Полная авторизация завершена. Теперь можно пользоваться всеми возможностями Подариса.", buttons);
        } else {
          await recordAdminLog("warning", "contact", "MAX contact signature validation failed", { userId: id, hasVcf: typeof payload.vcf_info === "string", hasHash: typeof payload.hash === "string" });
          await sendMaxMessage(id, "MAX не смог подтвердить подпись контакта. Вернитесь к кнопке «Поделиться контактом» и отправьте контакт ещё раз. Не отправляйте номер обычным текстом.");
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
  // Deterministic gift IDs make the one-time grant safe to retry after a partial Redis failure.
  if (!(await client.get("starter-gifts:" + userId))) {
    for (let index = 0; index < 3; index += 1) {
      const hash = crypto.createHash("sha256").update("podaris-starter:" + userId + ":" + index).digest("hex");
      const giftId = [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join("-");
      const gift = {
        id: giftId,
        giftType: "joystick_1",
        senderId: "podaris",
        recipientId: String(userId),
        status: "owned",
        message: "",
        revealDelaySeconds: 0,
        createdAt: Date.now(),
        claimedAt: null,
        opensAt: null,
        expiresAt: null,
        openedAt: null,
        forwardedFrom: null,
        shareUrl: null,
        source: "starter_registration"
      };
      const created = await client.set("gift:" + gift.id, JSON.stringify(gift), { nx: true });
      if (created === "OK") await client.rPush("gifts:received:" + userId, gift.id);
    }
    await client.set("starter-gifts:" + userId, "granted");
  }
  // Starter gifts are inventory items, not spendable send credits.
  await client.set("gift-credits:" + userId, "0");
  return 0;
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
  const [receivedIds, sentIds, historyIds] = await Promise.all([
    client.lRange("gifts:received:" + userId, 0, -1),
    client.lRange("gifts:sent:" + userId, 0, -1),
    client.lRange("gifts:history:" + userId, 0, -1)
  ]);
  const [received, sent, history] = await Promise.all([
    Promise.all(receivedIds.map(readGift)),
    Promise.all(sentIds.map(readGift)),
    Promise.all(historyIds.map(readGift))
  ]);
  async function normalize(gift, giftId, listKey) {
    if (!gift) {
      await client.lRem(listKey, 0, giftId);
      return null;
    }
    return gift;
  }
  return {
    received: (await Promise.all(received.map((gift,index)=>normalize(gift,receivedIds[index],"gifts:received:"+userId)))).filter(Boolean),
    sent: (await Promise.all(sent.map((gift,index)=>normalize(gift,sentIds[index],"gifts:sent:"+userId)))).filter(g=>g&&g.status==="sent"),
    history: (await Promise.all(history.map((gift,index)=>normalize(gift,historyIds[index],"gifts:history:"+userId)))).filter(Boolean)
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
      giftCredits: balance, gifts: { received: gifts.received, sent: fullyAuthorized ? gifts.sent : [], history: fullyAuthorized ? gifts.history : [] }
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
      senderName: [user.firstName,user.lastName].filter(Boolean).join(" ").trim() || "Пользователь MAX",
      recipientId,
      recipientName: "",
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

  if (path === "/api/gifts/keep") {
    const giftId = String(body?.giftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(giftId)) return giftError(400, "invalid_gift_id");
    const gift = await readGift(giftId);
    if (!gift) return giftError(404, "gift_not_found");
    if (gift.recipientId !== userId) return giftError(403, "not_gift_recipient");
    if (!["owned", "kept"].includes(gift.status)) return giftError(409, "gift_not_keepable");
    gift.status = "kept";
    gift.keptAt = Date.now();
    await saveGift(gift);
    return { statusCode: 200, body: { ok: true, gift } };
  }

  if (path === "/api/gifts/claim" || path === "/api/gifts/open" || path === "/api/gifts/forward") {
    const giftId = String(body?.giftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(giftId)) return giftError(400, "invalid_gift_id");
    const gift = await readGift(giftId);
    if (!gift) return giftError(404, "gift_not_found");
    const now = Date.now();

    if (path === "/api/gifts/claim") {
      if (gift.status === "claimed" || gift.status === "opened") {
        if (gift.recipientId === userId) return { statusCode: 200, body: { ok: true, gift, alreadyClaimed: true } };
        return giftError(409, "gift_already_claimed");
      }
      if (gift.status !== "sent") return giftError(409, "gift_not_claimable");
      if (gift.recipientId && gift.recipientId !== userId) return giftError(403, "not_gift_recipient");

      // A gift shared by link has no recipient until the first authenticated user claims it.
      if (!gift.recipientId) {
        const claimLock = "gift-claim-lock:" + gift.id;
        const locked = await client.set(claimLock, userId, { nx: true, px: 30000 });
        if (locked !== "OK") return giftError(409, "gift_already_claimed");
        try {
          const latest = await readGift(gift.id);
          if (!latest || latest.status !== "sent" || latest.recipientId) return giftError(409, "gift_already_claimed");
          latest.recipientId = userId;
          latest.recipientName = [user.firstName,user.lastName].filter(Boolean).join(" ").trim() || "Пользователь MAX";
          latest.claimedByLink = true;
          latest.status = "claimed";
          latest.claimedAt = now;
          latest.opensAt = now + Number(latest.revealDelaySeconds || 0) * 1000;
          latest.expiresAt = null;
          await saveGift(latest);
          await client.rPush("gifts:received:" + userId, latest.id);
          if (latest.senderId && latest.senderId !== "purchase" && latest.senderId !== userId) {
            await client.lRem("gifts:sent:" + latest.senderId, 0, latest.id);
            await client.rPush("gifts:history:" + latest.senderId, latest.id);
          }
          return { statusCode: 200, body: { ok: true, gift: latest } };
        } finally {
          await client.del(claimLock);
        }
      }

      gift.status = "claimed";
      gift.recipientName = [user.firstName,user.lastName].filter(Boolean).join(" ").trim() || "Пользователь MAX";
      gift.claimedAt = now;
      gift.opensAt = now + Number(gift.revealDelaySeconds || 0) * 1000;
      gift.expiresAt = null;
      await saveGift(gift);
      if (gift.senderId && gift.senderId !== "purchase" && gift.senderId !== userId) {
        await client.lRem("gifts:sent:" + gift.senderId, 0, gift.id);
        await client.rPush("gifts:history:" + gift.senderId, gift.id);
      }
      return { statusCode: 200, body: { ok: true, gift } };
    }

    if (path === "/api/gifts/open") {
      if (gift.recipientId !== userId) return giftError(403, "not_gift_recipient");
      if (gift.status !== "claimed") return giftError(409, "gift_not_ready");
      if (now < gift.opensAt) return giftError(409, "gift_not_ready", { opensAt: gift.opensAt });
      gift.status = "opened";
      gift.openedAt = now;
      await saveGift(gift);
      return { statusCode: 200, body: { ok: true, gift } };
    }

    if (!fullyAuthorized) return giftError(403, "full_authorization_required");
    if (gift.recipientId !== userId) return giftError(403, "not_gift_recipient");
    if (!["opened", "owned", "kept"].includes(gift.status)) return giftError(409, "gift_not_forwardable");
    const shareByLink = body?.shareLink === true;
    const newRecipientId = shareByLink ? "" : String(body?.recipientId || "");
    if (!shareByLink && (!/^\d+$/.test(newRecipientId) || newRecipientId === userId)) return giftError(400, "invalid_recipient");
    const forwardedId = crypto.randomUUID();
    const forwarded = {
      ...gift,
      id: forwardedId,
      senderId: userId,
      senderName: [user.firstName,user.lastName].filter(Boolean).join(" ").trim() || "Пользователь MAX",
      recipientId: shareByLink ? null : newRecipientId,
      recipientName: "",
      status: "sent",
      createdAt: now,
      claimedAt: null,
      opensAt: null,
      expiresAt: null,
      openedAt: null,
      forwardedFrom: gift.id,
      claimedByLink: false,
      shareUrl: shareByLink
        ? "https://max.ru/se14711525_1_bot?startapp=gift_" + forwardedId
        : (process.env.MAX_MINI_APP_URL
          ? process.env.MAX_MINI_APP_URL + (process.env.MAX_MINI_APP_URL.includes("?") ? "&" : "?") + "gift=" + forwardedId
          : null)
    };
    gift.status = "forwarded";
    gift.forwardedAt = now;
    await saveGift(gift);
    await client.lRem("gifts:received:" + userId, 0, gift.id);
    await client.rPush("gifts:history:" + userId, gift.id);
    await client.set("gift:" + forwarded.id, JSON.stringify(forwarded));
    await client.rPush("gifts:sent:" + userId, forwarded.id);
    let notificationSent = false;
    if (!shareByLink) {
      await client.rPush("gifts:received:" + newRecipientId, forwarded.id);
      if (forwarded.shareUrl) {
        try {
          await sendMaxMessage(
            newRecipientId,
            "Вам переслали подарок в Подарис! Заберите его по кнопке ниже.",
            [[{ type: "open_app", text: "Получить подарок", web_app: forwarded.shareUrl }]]
          );
          notificationSent = true;
        } catch (error) {
          console.warn("[forward notification]", error.message);
        }
      }
    }
    return { statusCode: 201, body: { ok: true, gift: forwarded, notificationSent, shareByLink } };
  }

  return giftError(404, "gift_route_not_found");
}



function shopCatalogItem(sku) {
  const single = /^joystick_([1-6])$/.exec(String(sku || ""));
  if (single) return { amount: 200, items: [{ giftType: "joystick_" + single[1], quantity: 1 }] };
  if (sku === "joystick_collection") {
    return { amount: 1200, items: [1, 2, 3, 4, 5, 6].map(number => ({ giftType: "joystick_" + number, quantity: 1 })) };
  }
  return null;
}

async function handleShopOrder(body, user) {
  const receiver = String(process.env.YOOMONEY_RECEIVER || "").trim();
  const notificationSecret = String(process.env.YOOMONEY_NOTIFICATION_SECRET || "").trim();
  if (!receiver) {
    return { statusCode: 503, body: { ok: false, error: "yoomoney_receiver_not_configured" } };
  }
  if (!notificationSecret) {
    return { statusCode: 503, body: { ok: false, error: "yoomoney_notification_secret_not_configured" } };
  }
  const consent = await getConsent(user.id);
  if (!consentIsCurrent(consent)) return { statusCode: 403, body: { ok: false, error: "consent_required" } };
  const item = shopCatalogItem(body?.sku);
  if (!item) return { statusCode: 400, body: { ok: false, error: "invalid_shop_item" } };

  const client = await getRedis();
  const label = "pd_" + crypto.randomUUID().replace(/-/g, "");
  const order = {
    label,
    userId: String(user.id),
    amount: item.amount,
    items: item.items,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  await client.set("shop-order:" + label, JSON.stringify(order));
  const makePaymentUrl = (paymentType) => {
    const params = new URLSearchParams({
      receiver,
      "quickpay-form": "button",
      targets: "Подарис — коллекция Джойстик",
      paymentType,
      sum: Number(item.amount).toFixed(2),
      label,
      successURL: process.env.YOOMONEY_SUCCESS_URL || "https://musicdom.github.io/MaxPlay/?payment=success"
    });
    return "https://yoomoney.ru/quickpay/confirm.xml?" + params.toString();
  };
  return {
    statusCode: 201,
    body: {
      ok: true,
      order: { label, amount: item.amount, status: "pending" },
      paymentUrls: { wallet: makePaymentUrl("PC"), card: makePaymentUrl("AC") }
    }
  };
}

async function handleYooMoneyNotification(body) {
  const secret = String(process.env.YOOMONEY_NOTIFICATION_SECRET || "");
  if (!secret) return { statusCode: 503, body: { ok: false, error: "yoomoney_not_configured" } };
  const fields = body?.fields && typeof body.fields === "object" ? body.fields : body;
  const notificationType = String(fields?.notification_type || "");
  if (!["p2p-incoming", "card-incoming"].includes(notificationType)) {
    return { statusCode: 400, body: { ok: false, error: "unsupported_notification_type" } };
  }
  const label = String(fields?.label || "");
  const amount = Number(fields?.withdraw_amount ?? fields?.amount);
  const hmacSignature = String(fields?.sign || "").toLowerCase();
  const hmacPayload = Object.entries(fields || {})
    .filter(([key]) => key !== "sign")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + encodeURIComponent(String(value)))
    .join("&");
  const expectedHmac = crypto.createHmac("sha256", secret).update(hmacPayload).digest("hex");
  const hmacValid = /^[a-f0-9]{64}$/.test(hmacSignature) && safeEqual(expectedHmac, hmacSignature);
  const signatureParts = [
    notificationType,
    String(fields?.operation_id || ""),
    String(fields?.amount || ""),
    String(fields?.currency || ""),
    String(fields?.datetime || ""),
    String(fields?.sender || ""),
    String(fields?.codepro || ""),
    secret,
    label
  ];
  const expectedSha1 = crypto.createHash("sha1").update(signatureParts.join("&"), "utf8").digest("hex");
  const sha1Valid = safeEqual(expectedSha1.toLowerCase(), String(fields?.sha1_hash || "").toLowerCase());
  if (!hmacValid && !sha1Valid) {
    await recordAdminLog("warning", "yoomoney", "Отклонено уведомление с неверной подписью", { label: label.slice(0, 80) });
    return { statusCode: 401, body: { ok: false, error: "invalid_notification_signature" } };
  }
  if (!/^pd_[a-f0-9]{32}$/i.test(label) || !Number.isFinite(amount) || amount <= 0) {
    return { statusCode: 400, body: { ok: false, error: "invalid_payment_data" } };
  }

  const client = await getRedis();
  const orderKey = "shop-order:" + label;
  const raw = await client.get(orderKey);
  if (!raw) return { statusCode: 404, body: { ok: false, error: "order_not_found" } };
  let order;
  try { order = JSON.parse(raw); } catch { return { statusCode: 500, body: { ok: false, error: "invalid_order_record" } }; }
  if (order.status === "paid") return { statusCode: 200, body: { ok: true, alreadyProcessed: true } };
  if (Math.abs(Number(order.amount) - amount) > 0.009) {
    await recordAdminLog("warning", "yoomoney", "Сумма уведомления не совпала с заказом", { label, expected: order.amount, received: amount });
    return { statusCode: 400, body: { ok: false, error: "payment_amount_mismatch" } };
  }

  const lockKey = "payment-lock:" + label;
  const lock = await client.set(lockKey, "1", { nx: true, px: 60000 });
  if (lock !== "OK") return { statusCode: 200, body: { ok: true, processing: true } };
  try {
    const latestRaw = await client.get(orderKey);
    const latest = latestRaw ? JSON.parse(latestRaw) : null;
    if (!latest) return { statusCode: 404, body: { ok: false, error: "order_not_found" } };
    if (latest.status === "paid") return { statusCode: 200, body: { ok: true, alreadyProcessed: true } };

    for (const item of latest.items || []) {
      const quantity = Math.max(0, Math.min(20, Number(item.quantity) || 0));
      if (!/^joystick_[1-6]$/.test(String(item.giftType || "")) || quantity < 1) {
        throw new Error("Invalid gift item in paid order");
      }
      for (let index = 0; index < quantity; index += 1) {
        const now = Date.now();
        const giftHash = crypto.createHash("sha256").update("yoomoney:" + label + ":" + item.giftType + ":" + index).digest("hex");
        const giftId = [giftHash.slice(0, 8), giftHash.slice(8, 12), giftHash.slice(12, 16), giftHash.slice(16, 20), giftHash.slice(20, 32)].join("-");
        const gift = {
          id: giftId,
          giftType: item.giftType,
          senderId: "purchase",
          recipientId: String(latest.userId),
          status: "owned",
          message: "",
          revealDelaySeconds: 0,
          createdAt: now,
          claimedAt: null,
          opensAt: null,
          expiresAt: null,
          openedAt: null,
          forwardedFrom: null,
          shareUrl: null,
          source: "yoomoney_purchase",
          orderLabel: label
        };
        const created = await client.set("gift:" + gift.id, JSON.stringify(gift), { nx: true });
        if (created === "OK") await client.rPush("gifts:received:" + latest.userId, gift.id);
      }
    }
    latest.status = "paid";
    latest.paidAt = new Date().toISOString();
    latest.operationId = String(fields?.operation_id || "");
    await client.set(orderKey, JSON.stringify(latest));
    await recordAdminLog("info", "yoomoney", "Оплата подтверждена, подарки начислены", { label, amount, userId: latest.userId });
    return { statusCode: 200, body: { ok: true, paid: true } };
  } catch (error) {
    await recordAdminLog("error", "yoomoney", "Ошибка начисления подарков после оплаты", { label, message: error.message });
    return { statusCode: 500, body: { ok: false, error: "gift_credit_failed" } };
  } finally {
    await client.del(lockKey);
  }
}

async function handleAdminStatus(body){
 const allowed=new Set(String(process.env.ADMIN_MAX_IDS||'').split(',').map(value=>value.trim()).filter(Boolean));
 if(!allowed.has(String(body?.__verifiedUserId||'')))return {statusCode:403,body:{error:'admin_access_denied'}};
 let redis='unavailable';
 try{const client=await getRedis();await client.ping();redis='ok';}catch(error){console.error('[admin redis]',error.message);}
 return {statusCode:200,body:{ok:true,isAdmin:true,userId:String(body.__verifiedUserId),redis,maxBotConfigured:Boolean(process.env.MAX_BOT_TOKEN),webhookSecretConfigured:Boolean(process.env.MAX_WEBHOOK_SECRET),checkedAt:new Date().toISOString()}};
}

async function recordAdminLog(level, source, message, details = {}) {
  try {
    const client = await getRedis();
    const entry = { at: new Date().toISOString(), level: String(level || "info").slice(0, 12), source: String(source || "server").slice(0, 40), message: String(message || "Событие").slice(0, 240), details: details && typeof details === "object" ? details : {} };
    await client.rPush("admin:logs", JSON.stringify(entry));
    await client.lTrim("admin:logs", -50, -1);
  } catch (error) { console.error("[admin log write]", error.message); }
}

async function handleAdminDiagnostics() {
  const webhookUrl = "https://functions.yandexcloud.net/d4eu88tanqd001ko5llp?route=webhook";
  if (!process.env.MAX_BOT_TOKEN) return { statusCode: 200, body: { ok: true, apiReachable: false, webhookConfigured: false, error: "max_bot_not_configured" } };
  try {
    const result = await fetch("https://platform-api2.max.ru/subscriptions", { method: "GET", headers: { Authorization: process.env.MAX_BOT_TOKEN } });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) {
      await recordAdminLog("error", "max-subscriptions", "MAX API вернул ошибку", { status: result.status });
      return { statusCode: 200, body: { ok: true, apiReachable: false, webhookConfigured: false, error: "max_api_error", status: result.status } };
    }
    const subscriptions = Array.isArray(payload.subscriptions) ? payload.subscriptions : Array.isArray(payload) ? payload : [];
    const matching = subscriptions.find(item => String(item.url || "") === webhookUrl);
    return { statusCode: 200, body: { ok: true, checkedAt: new Date().toISOString(), apiReachable: true, webhookConfigured: Boolean(matching), webhookUrl, subscriptionCount: subscriptions.length, updateTypes: matching && Array.isArray(matching.update_types) ? matching.update_types : [], secretConfigured: Boolean(process.env.MAX_WEBHOOK_SECRET) } };
  } catch (error) {
    await recordAdminLog("error", "max-subscriptions", "Не удалось проверить подписку MAX", { message: error.message });
    return { statusCode: 200, body: { ok: true, apiReachable: false, webhookConfigured: false, error: "max_api_unavailable" } };
  }
}

async function handleAdminRegisterWebhook() {
  const webhookUrl = "https://functions.yandexcloud.net/d4eu88tanqd001ko5llp?route=webhook";
  const token = process.env.MAX_BOT_TOKEN;
  const secret = process.env.MAX_WEBHOOK_SECRET;
  if (!token || !secret) {
    return { statusCode: 503, body: { ok: false, error: "max_bot_or_webhook_secret_not_configured" } };
  }

  try {
    const headers = { Authorization: token, "Content-Type": "application/json" };
    const listResponse = await fetch("https://platform-api2.max.ru/subscriptions", {
      method: "GET",
      headers: { Authorization: token }
    });
    const listPayload = await listResponse.json().catch(() => ({}));
    if (!listResponse.ok) {
      await recordAdminLog("error", "max-subscriptions", "Не удалось прочитать подписки MAX перед регистрацией", { status: listResponse.status });
      return { statusCode: 502, body: { ok: false, error: "max_api_list_failed", status: listResponse.status } };
    }

    const subscriptions = Array.isArray(listPayload.subscriptions) ? listPayload.subscriptions : Array.isArray(listPayload) ? listPayload : [];
    const existing = subscriptions.find(item => String(item.url || "") === webhookUrl);
    if (existing) {
      return {
        statusCode: 200,
        body: {
          ok: true, alreadyRegistered: true, webhookConfigured: true,
          subscriptionCount: subscriptions.length,
          updateTypes: Array.isArray(existing.update_types) ? existing.update_types : [],
          webhookUrl
        }
      };
    }

    const registerResponse = await fetch("https://platform-api2.max.ru/subscriptions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: webhookUrl,
        update_types: ["bot_started", "message_created", "message_callback"],
        secret
      })
    });
    const registerPayload = await registerResponse.json().catch(() => ({}));
    if (!registerResponse.ok) {
      await recordAdminLog("error", "max-subscriptions", "MAX отклонил регистрацию webhook", { status: registerResponse.status });
      return {
        statusCode: 502,
        body: { ok: false, error: "max_api_register_failed", status: registerResponse.status, details: registerPayload }
      };
    }

    const verifyResponse = await fetch("https://platform-api2.max.ru/subscriptions", {
      method: "GET",
      headers: { Authorization: token }
    });
    const verifyPayload = await verifyResponse.json().catch(() => ({}));
    const verifiedSubscriptions = Array.isArray(verifyPayload.subscriptions) ? verifyPayload.subscriptions : Array.isArray(verifyPayload) ? verifyPayload : [];
    const matching = verifiedSubscriptions.find(item => String(item.url || "") === webhookUrl);
    if (!verifyResponse.ok || !matching) {
      await recordAdminLog("warning", "max-subscriptions", "MAX принял запрос, но подписка не найдена при повторной проверке", { status: verifyResponse.status });
      return { statusCode: 502, body: { ok: false, error: "webhook_registration_not_verified", subscriptionCount: verifiedSubscriptions.length } };
    }

    await recordAdminLog("info", "max-subscriptions", "Webhook Подариса успешно зарегистрирован в MAX", {
      updateTypes: Array.isArray(matching.update_types) ? matching.update_types : []
    });
    return {
      statusCode: 200,
      body: {
        ok: true, registered: true, webhookConfigured: true,
        subscriptionCount: verifiedSubscriptions.length,
        updateTypes: Array.isArray(matching.update_types) ? matching.update_types : [],
        webhookUrl
      }
    };
  } catch (error) {
    await recordAdminLog("error", "max-subscriptions", "Ошибка регистрации webhook MAX", { message: error.message });
    return { statusCode: 502, body: { ok: false, error: "max_api_register_unavailable" } };
  }
}

async function handleAdminLogs() {
  try {
    const client = await getRedis();
    const raw = await client.lRange("admin:logs", -30, -1);
    const logs = raw.map(item => { try { return JSON.parse(item); } catch { return null; } }).filter(Boolean).reverse();
    return { statusCode: 200, body: { ok: true, logs, checkedAt: new Date().toISOString() } };
  } catch (error) { return { statusCode: 503, body: { ok: false, error: "admin_logs_unavailable" } }; }
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

  if (method === "POST" && ["/api/auth", "/api/consent/status", "/api/consent/accept", "/api/gifts/list", "/api/gifts/send", "/api/gifts/claim", "/api/gifts/open", "/api/gifts/keep", "/api/gifts/forward", "/api/shop/order", "/api/admin/status", "/api/admin/diagnostics", "/api/admin/register-webhook", "/api/admin/logs"].includes(path)) {
    if (!process.env.MAX_BOT_TOKEN) return response(503, { error: "max_bot_not_configured" });
    const auth = validateMaxInitData(body?.initData, process.env.MAX_BOT_TOKEN);
    if (!auth.ok) return response(401, { error: "unauthorized", reason: auth.reason });

    try {
      const user = await saveUser(auth.user);
      if (path.startsWith("/api/admin/")) {
        const adminResult = await handleAdminStatus({ __verifiedUserId: user.id });
        if (adminResult.statusCode !== 200) return response(adminResult.statusCode, adminResult.body);
        if (path === "/api/admin/status") return response(200, adminResult.body);
        if (path === "/api/admin/diagnostics") {
          const diagnostic = await handleAdminDiagnostics();
          return response(diagnostic.statusCode, diagnostic.body);
        }
        if (path === "/api/admin/register-webhook") {
          const registration = await handleAdminRegisterWebhook();
          return response(registration.statusCode, registration.body);
        }
        if (path === "/api/admin/logs") {
          const logs = await handleAdminLogs();
          return response(logs.statusCode, logs.body);
        }
        return response(404, { error: "admin_route_not_found" });
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
      if (path === "/api/shop/order") {
        const order = await handleShopOrder(body, user);
        return response(order.statusCode, order.body);
      }
      if (path.startsWith("/api/gifts/")) {
        const consent = await getConsent(user.id);
        if (!consentIsCurrent(consent)) return response(403, { error: "consent_required" });
        const result = await handleGiftRequest(path, body, user);
        return response(result.statusCode, result.body);
      }

      if (path === "/api/consent/status") {
        const consent = await getConsent(user.id);
        const contact = await getSavedContact(user.id);
        const accepted = consentIsCurrent(consent);
        const fullyAuthorized = accepted && Boolean(contact?.phone);
        return response(200, {
          ok: true,
          accepted,
          required: !accepted,
          contactRequired: accepted && !contact?.phone,
          fullyAuthorized,
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
      return response(200, { ok: true, accepted: true, consent, contactRequestSent: true, contactRequired: true, fullyAuthorized: false });
    } catch (error) {
      console.error("[consent]", error.message);
      return response(503, { error: "storage_unavailable" });
    }
  }

  if (method === "POST" && path === "/api/yoomoney/notify") {
    try {
      const result = await handleYooMoneyNotification(body);
      return response(result.statusCode, result.body);
    } catch (error) {
      console.error("[YooMoney notification]", error.message);
      return response(500, { ok: false, error: "notification_processing_failed" });
    }
  }

  if (method === "POST" && path === "/api/max/webhook") {
    const suppliedSecret = headerValue(event.headers, "X-Max-Bot-Api-Secret");
    if (!safeEqual(suppliedSecret, process.env.MAX_WEBHOOK_SECRET)) {
      return response(401, { error: "invalid_webhook_secret" });
    }
    try {
      await handleMaxUpdate(body);
      await recordAdminLog("info", "max-webhook", "Получено обновление MAX", { updateType: String(body?.update_type || "unknown") });
      return response(200, { ok: true });
    } catch (error) {
      console.error("[MAX webhook]", error.message);
      await recordAdminLog("error", "max-webhook", error.message);
      return response(500, { error: "webhook_processing_failed" });
    }
  }

  return response(404, { error: "not_found" });
};

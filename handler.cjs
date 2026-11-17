const crypto = require("node:crypto");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("redis");

let maxCertificates;
function getMaxCertificates() {
  if (maxCertificates) return maxCertificates;
  const certDir = path.join(process.cwd(), "certs");
  const rootPath = path.join(certDir, "russian_trusted_root_ca.pem");
  const gostPath = path.join(certDir, "russian_trusted_root_ca_gost_2025.pem");
  if (!fs.existsSync(rootPath) || !fs.existsSync(gostPath)) {
    throw new Error("Ministry of Digital Development CA certificates are missing from certs/");
  }
  maxCertificates = [fs.readFileSync(rootPath), fs.readFileSync(gostPath)];
  return maxCertificates;
}

// MAX API requests use the two Ministry of Digital Development root CAs,
// matching the working Norka integration. Other HTTPS requests keep native fetch.
function maxApiFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = options.body == null ? null : String(options.body);
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method: options.method || "GET",
      headers: options.headers || {},
      ca: getMaxCertificates(),
      rejectUnauthorized: true,
      timeout: 15000
    }, (incoming) => {
      let raw = "";
      incoming.setEncoding("utf8");
      incoming.on("data", chunk => { raw += chunk; });
      incoming.on("end", () => {
        resolve({
          ok: (incoming.statusCode || 0) >= 200 && (incoming.statusCode || 0) < 300,
          status: incoming.statusCode || 0,
          text: async () => raw,
          json: async () => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
        });
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("MAX API request timed out")));
    if (body) request.write(body);
    request.end();
  });
}
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
    ping: async () => command(["PING"]),
    sAdd: async (key, value) => Number(await command(["SADD", key, value])),
    sMembers: async (key) => (await command(["SMEMBERS", key])) || [],
    scan: async (cursor, pattern, count = 500) => command(["SCAN", String(cursor), "MATCH", pattern, "COUNT", String(count)]),
    eval: async (script, keys = [], args = []) => command(["EVAL", script, String(keys.length), ...keys, ...args.map(value => String(value))])
  };
}

let redisClient;
let redisClientPromise;

function createManagedRedisClient() {
  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) throw new Error("REDIS_URL is required for Yandex Managed Redis");

  const native = createClient({ url });
  native.on("error", error => console.error("[redis client]", error?.message || error));
  let connecting;

  async function ready() {
    if (native.isReady) return;
    if (!native.isOpen && !connecting) {
      connecting = native.connect().finally(() => { connecting = null; });
    }
    if (connecting) await connecting;
  }

  return {
    get: async key => { await ready(); return native.get(key); },
    set: async (key, value, options = {}) => {
      await ready();
      const redisOptions = {};
      if (options.nx) redisOptions.NX = true;
      if (options.px) redisOptions.PX = Number(options.px);
      return native.set(key, value, Object.keys(redisOptions).length ? redisOptions : undefined);
    },
    del: async key => { await ready(); return native.del(key); },
    decr: async key => { await ready(); return native.decr(key); },
    incr: async key => { await ready(); return native.incr(key); },
    lRange: async (key, start, stop) => { await ready(); return native.lRange(key, start, stop); },
    lRem: async (key, count, value) => { await ready(); return native.lRem(key, count, value); },
    rPush: async (key, value) => { await ready(); return native.rPush(key, value); },
    lTrim: async (key, start, stop) => { await ready(); return native.lTrim(key, start, stop); },
    pExpireAt: async (key, timestamp) => { await ready(); return native.pExpireAt(key, timestamp); },
    ping: async () => { await ready(); return native.ping(); },
    sAdd: async (key, value) => { await ready(); return native.sAdd(key, value); },
    sMembers: async key => { await ready(); return native.sMembers(key); },
    scan: async (cursor, pattern, count = 500) => {
      await ready();
      const result = await native.scan(String(cursor), { MATCH: pattern, COUNT: count });
      return [String(result.cursor), result.keys || []];
    },
    eval: async (script, keys = [], args = []) => {
      await ready();
      return native.eval(script, { keys, arguments: args.map(value => String(value)) });
    }
  };
}

const AGREEMENT_VERSION = process.env.USER_AGREEMENT_VERSION || "1.0.0";
const PRIVACY_VERSION = process.env.PRIVACY_POLICY_VERSION || "1.0.0";
const LEGAL_BASE_URL = process.env.LEGAL_BASE_URL || "https://musicdom.github.io/MaxPlay/legal";

async function getRedis() {
  if (redisClient) return redisClient;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      if (String(process.env.REDIS_URL || "").trim()) {
        const client = createManagedRedisClient();
        await client.ping();
        return client;
      }
      if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        return createUpstashClient();
      }
      throw new Error("Configure REDIS_URL or both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
    })().catch(error => {
      redisClientPromise = null;
      throw error;
    });
  }
  redisClient = await redisClientPromise;
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
      photoUrl: [user.photo_url, user.photoUrl, user.avatar_url, user.avatarUrl].find(value => typeof value === "string" && value.trim()) || null
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
    photoUrl: user.photoUrl || user.photo_url || user.avatar_url || user.avatarUrl || existing.photoUrl || null,
    createdAt,
    updatedAt: new Date().toISOString()
  };
  await client.set(key, JSON.stringify(record));
  await client.sAdd("users:index", String(user.id));
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

async function grantStarterMilestoneGift(userId, milestone) {
  const id = String(userId);
  const allowed = new Set(["consent", "contact", "channel"]);
  if (!id || !allowed.has(milestone)) throw new Error("invalid_starter_milestone");
  const client = await getRedis();
  // Accounts granted the former three-gift bundle keep those exact gifts; never issue a second bundle.
  if (await client.get("starter-gifts:" + id)) {
    await client.set("starter-milestone:" + id + ":" + milestone, "legacy");
    return { granted: false, legacy: true };
  }
  const markerKey = "starter-milestone:" + id + ":" + milestone;
  if (await client.get(markerKey)) return { granted: false, alreadyGranted: true };
  const hash = crypto.createHash("sha256").update("podaris-starter:" + id + ":" + milestone).digest("hex");
  const giftId = [hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20,32)].join("-");
  const gift = {
    id: giftId, giftType: "loviday", senderId: "podaris", senderName: "ЛовиДай",
    recipientId: id, recipientName: "", ownerId: id, status: "owned",
    message: "", revealDelaySeconds: 0, createdAt: Date.now(), claimedAt: null,
    opensAt: null, expiresAt: null, openedAt: null, forwardedFrom: null,
    shareUrl: null, source: "starter_milestone", milestone
  };
  const created = await client.eval(
    "if redis.call('GET',KEYS[1]) then return 0 end; if redis.call('EXISTS',KEYS[2])==0 then redis.call('SET',KEYS[2],ARGV[1]); end; if not redis.call('LPOS',KEYS[3],ARGV[2]) then redis.call('RPUSH',KEYS[3],ARGV[2]); end; redis.call('SET',KEYS[1],'granted'); return 1",
    [markerKey, "gift:" + giftId, "gifts:received:" + id],
    [JSON.stringify(gift), giftId]
  );
  return { granted: Number(created) === 1, alreadyGranted: Number(created) !== 1, giftId };
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
  await grantStarterMilestoneGift(userId, "consent");
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
  const result = await maxApiFetch(url, {
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
    rows.push([{ type: "open_app", text: "Открыть ЛовиДай и принять", web_app: process.env.MAX_MINI_APP_URL }]);
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
      ? [[{ type: "open_app", text: "Открыть ЛовиДай", web_app: process.env.MAX_MINI_APP_URL }]]
      : [];
    await sendMaxMessage(userId, "Ваш номер телефона подтверждён. Полная авторизация завершена.", buttons);
    return;
  }
  const buttons = contactRequestButtons();
  if (process.env.MAX_MINI_APP_URL) {
    buttons.push([{ type: "open_app", text: "Открыть ЛовиДай", web_app: process.env.MAX_MINI_APP_URL }]);
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
  await grantStarterMilestoneGift(userId, "contact");
  return true;
}

async function sendConsentPrompt(userId) {
  await sendMaxMessage(
    userId,
    "Добро пожаловать в ЛовиДай! Для работы приложения MAX передаёт доступные данные профиля: MAX ID, имя, фамилию, username, язык и фотографию профиля (если они доступны). Номер телефона и другие контактные сведения мы запросим отдельно — только если вы нажмёте «Поделиться контактом». Ознакомьтесь с документами и подтвердите согласие.",
    legalButtons()
  );
}

async function handleMaxUpdate(update) {
  const type = update.update_type;
  if (type === "bot_added" && update.is_channel === true && update.chat_id !== undefined) {
    const client = await getRedis();
    await client.set("podaris:loviday:channel_id", String(update.chat_id));
    await recordAdminLog("info", "channel-subscription", "Бот добавлен в канал MAX; сохранён ID канала для проверки подписок", {
      chatId: String(update.chat_id), channel: "https://max.ru/channel_loviday"
    });
  }
  if (type === "bot_removed" && update.is_channel === true && update.chat_id !== undefined) {
    const client = await getRedis();
    const currentChannelId = await client.get("podaris:loviday:channel_id");
    if (String(currentChannelId || "") === String(update.chat_id)) {
      await client.del("podaris:loviday:channel_id");
      await recordAdminLog("warning", "channel-subscription", "Бот удалён из канала ЛовиДай; проверка подписки отключена", {
        chatId: String(update.chat_id)
      });
    }
  }
  const user = update.user || update.callback?.user || update.message?.sender || {};
  const userId = user.user_id ?? user.id;
  if (userId === undefined || userId === null) {
    if (type === "bot_added" || type === "bot_removed") return;
    return;
  }

  const id = String(userId);
  await saveUser({
    id,
    firstName: typeof user.first_name === "string" ? user.first_name : "",
    lastName: typeof user.last_name === "string" ? user.last_name : "",
    username: typeof user.username === "string" ? user.username : null,
    languageCode: typeof update.user_locale === "string" ? update.user_locale : null,
    photoUrl: [user.photo_url, user.photoUrl, user.avatar_url, user.avatarUrl, user.avatar?.url].find(value => typeof value === "string" && value.trim()) || null
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
            ? [[{ type: "open_app", text: "Открыть ЛовиДай", web_app: process.env.MAX_MINI_APP_URL }]]
            : [];
          await sendMaxMessage(id, "Номер телефона подтверждён! Полная авторизация завершена. Теперь можно пользоваться всеми возможностями ЛовиДай.", buttons);
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
        ? [[{ type: "open_app", text: "Открыть ЛовиДай", web_app: process.env.MAX_MINI_APP_URL }]]
        : [];
      await sendContactPrompt(id);
      if (buttons.length) await sendMaxMessage(id, "Вы уже приняли действующие документы. Можно открыть ЛовиДай.", buttons);
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
          ? [[{ type: "open_app", text: "Открыть ЛовиДай", web_app: process.env.MAX_MINI_APP_URL }]]
          : [];
        await sendContactPrompt(id);
        if (buttons.length) await sendMaxMessage(id, "Вы уже приняли действующие документы. Можно открыть ЛовиДай.", buttons);
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
      ? [[{ type: "open_app", text: "Открыть ЛовиДай", web_app: process.env.MAX_MINI_APP_URL }]]
      : [];
    if (buttons.length) await sendMaxMessage(id, "Теперь вам доступно приложение ЛовиДай.", buttons);
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
      gift.ownerId = String(userId);
      await client.eval(
        "if redis.call('EXISTS',KEYS[1])==0 then redis.call('SET',KEYS[1],ARGV[1]); end; if not redis.call('LPOS',KEYS[2],ARGV[2]) then redis.call('RPUSH',KEYS[2],ARGV[2]); end; return 1",
        ["gift:" + gift.id, "gifts:received:" + userId],
        [JSON.stringify(gift), gift.id]
      );
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
  const [receivedRaw, sentRaw, historyRaw, linkIncomingRaw] = await Promise.all([
    client.lRange("gifts:received:" + userId, 0, -1),
    client.lRange("gifts:sent:" + userId, 0, -1),
    client.lRange("gifts:history:" + userId, 0, -1),
    client.lRange("gifts:link-incoming:" + userId, 0, -1)
  ]);

  const receivedIds = [...new Set(receivedRaw.map(String))];
  const sentIds = [...new Set(sentRaw.map(String))];
  const linkIncomingIds = [...new Set(linkIncomingRaw.map(String))];
  const [receivedValues, sentValues, linkIncomingValues] = await Promise.all([
    Promise.all(receivedIds.map(readGift)),
    Promise.all(sentIds.map(readGift)),
    Promise.all(linkIncomingIds.map(readGift))
  ]);

  const received = receivedValues.filter(gift =>
    gift && gift.status !== "sent" && gift.expiredReason !== "pickup_timeout" &&
    String(gift.recipientId || "") === String(userId)
  );
  const now = Date.now();
  const pendingLinkGifts = linkIncomingValues
    .filter(gift => gift && gift.status === "sent" &&
      (!gift.pickupExpiresAt || Number(gift.pickupExpiresAt) > now) &&
      (!gift.recipientId || String(gift.recipientId) === String(userId)))
    .map(gift => ({ ...gift, pendingLink: true }));
  for (const gift of pendingLinkGifts) {
    if (!received.some(item => String(item.id) === String(gift.id))) received.push(gift);
  }
  const sent = sentValues.filter(gift =>
    gift && gift.status === "sent" &&
    (!gift.pickupExpiresAt || Number(gift.pickupExpiresAt) > now) &&
    String(gift.senderId || "") === String(userId)
  );

  // New history entries are immutable snapshots stored under gift-event:<eventId>.
  // Legacy entries are gift IDs; keep them readable without mutating old records.
  const historyValues = await Promise.all(historyRaw.map(async rawId => {
    const eventRaw = await client.get("gift-event:" + rawId);
    if (eventRaw) {
      try {
        const event = JSON.parse(eventRaw);
        if (event && event.gift) return { ...event.gift, historyEventId: event.id || String(rawId), historyAt: event.claimedAt || event.sentAt || null };
      } catch {}
    }
    return readGift(String(rawId));
  }));
  const history = [];
  const seenHistory = new Set();
  for (const gift of historyValues) {
    if (!gift || String(gift.senderId || "") !== String(userId)) continue;

    // Legacy history entries store a mutable gift ID, not an immutable snapshot.
    // If that gift is currently being sent again, the active "sent" list already
    // represents it; don't show the stale history reference as a second card.
    if (gift.status === "sent") continue;

    // A legacy gift-ID entry and its newer gift-event snapshot can describe the
    // same claim. Deduplicate by the claim itself, not by the event storage ID.
    // Different recipients or claim times remain separate transfer records.
    const key = gift.id
      ? [String(gift.id), String(gift.recipientId || ""), String(gift.claimedAt || gift.createdAt || "")].join(":")
      : String(gift.historyEventId || "");
    if (seenHistory.has(key)) continue;
    seenHistory.add(key);
    history.push(gift);
  }

  const profileIds = [...new Set([...received, ...sent, ...history].flatMap(g => [String(g.senderId || ""), String(g.recipientId || "")]).filter(id => /^\d+$/.test(id)))];
  const profilePairs = await Promise.all(profileIds.map(async id => {
    const raw = await client.get("user:" + id);
    try { const profile = raw ? JSON.parse(raw) : null; return [id, profile ? { photoUrl: profile.photoUrl || profile.photo_url || profile.avatar_url || profile.avatarUrl || null, name: [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.username || id } : null]; }
    catch { return [id, null]; }
  }));
  const profiles = new Map(profilePairs);
  const addAvatars = gift => ({
    ...gift,
    senderPhotoUrl: profiles.get(String(gift.senderId || ""))?.photoUrl || null,
    recipientPhotoUrl: profiles.get(String(gift.recipientId || ""))?.photoUrl || null,
    senderName: gift.senderName || profiles.get(String(gift.senderId || ""))?.name || "Пользователь MAX",
    recipientName: gift.recipientName || profiles.get(String(gift.recipientId || ""))?.name || ""
  });
  return { received: received.map(addAvatars), sent: sent.map(addAvatars), history: history.map(addAvatars) };
}
function giftError(statusCode, error, extra = {}) {
  return { statusCode, body: { ok: false, error, ...extra } };
}

async function handleGiftRequest(path, body, user) {
  const userId = String(user.id);
  const consent = await getConsent(userId);
  if (!consentIsCurrent(consent)) return giftError(403, "consent_required");
  const client = await getRedis();
  const fullyAuthorized = await isFullyAuthorized(userId);
  const balance = await getGiftBalance(userId);

  if (path === "/api/gifts/list") {
    const gifts = await listUserGifts(userId);
    return { statusCode: 200, body: {
      ok: true, fullyAuthorized, canSend: fullyAuthorized && gifts.received.some(g => ["owned","opened","kept"].includes(g.status)),
      canBuy: true, canViewReceived: true, canForward: fullyAuthorized,
      giftCredits: balance,
      gifts: { received: gifts.received, sent: gifts.sent, history: fullyAuthorized ? gifts.history : [] }
    }};
  }

  if (path === "/api/gifts/link-preview") {
    const giftId = String(body?.giftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(giftId)) return giftError(400, "invalid_gift_id");
    const gift = await readGift(giftId);
    if (!gift) return giftError(404, "gift_not_found");
    if (gift.status !== "sent") {
      if (String(gift.recipientId || "") === userId) return { statusCode: 200, body: { ok: true, alreadyReceived: true } };
      return giftError(409, "gift_not_available");
    }
    if (gift.recipientId && String(gift.recipientId) !== userId) return giftError(403, "wrong_recipient");
    const now = Date.now();
    const previewResult = await client.eval(
      "local raw=redis.call('GET',KEYS[1]); if not raw then return 'missing' end; local g=cjson.decode(raw); if g.status~='sent' then return 'unavailable' end; if g.recipientId and g.recipientId~=cjson.null and tostring(g.recipientId)~='' and tostring(g.recipientId)~=ARGV[1] then return 'wrong_recipient' end; local now=tonumber(ARGV[2]); if g.pickupExpiresAt and g.pickupExpiresAt~=cjson.null and tonumber(g.pickupExpiresAt)>0 and tonumber(g.pickupExpiresAt)<=now then g.status='expired'; g.expiredReason='pickup_timeout'; g.expiredAt=now; redis.call('SET',KEYS[1],cjson.encode(g)); redis.call('LREM',KEYS[2],0,ARGV[3]); return 'expired' end; if not g.pickupExpiresAt or g.pickupExpiresAt==cjson.null or tonumber(g.pickupExpiresAt)==0 then g.pickupExpiresAt=now+43200000 end; if not g.opensAt or g.opensAt==cjson.null or tonumber(g.opensAt)==0 then g.opensAt=now+(tonumber(g.revealDelaySeconds or 0)*1000) end; g.expiresAt=cjson.null; if not redis.call('LPOS',KEYS[2],ARGV[3]) then redis.call('RPUSH',KEYS[2],ARGV[3]); end; redis.call('SET',KEYS[1],cjson.encode(g)); return cjson.encode(g)",
      ["gift:" + giftId, "gifts:link-incoming:" + userId],
      [userId, now, giftId]
    );
    if (previewResult === "missing") return giftError(404, "gift_not_found");
    if (previewResult === "wrong_recipient") return giftError(403, "wrong_recipient");
    if (previewResult === "unavailable") return giftError(409, "gift_not_available");
    if (previewResult === "expired") return giftError(409, "gift_expired");
    return { statusCode: 200, body: { ok: true, pending: true, gift: JSON.parse(previewResult) } };
  }

  if (path === "/api/gifts/send") {
    if (!fullyAuthorized) return giftError(403, "full_authorization_required");
    const recipientId = String(body?.recipientId || "");
    const giftType = String(body?.giftType || "");
    const revealDelaySeconds = Number(body?.revealDelaySeconds ?? 0);
    if (!/^\d+$/.test(recipientId) || recipientId === userId) return giftError(400, "invalid_recipient");
    if (!["project", "family_heart", "friend", "loviday", "loviday_love", "loviday_friend", "loviday_steel", "loviday_cyber"].includes(giftType) && !/^joystick_[1-6]$/.test(giftType)) return giftError(400, "invalid_gift_type");
    if (!Number.isInteger(revealDelaySeconds) || revealDelaySeconds < 0 || revealDelaySeconds > 30 * 24 * 60 * 60) {
      return giftError(400, "invalid_reveal_delay");
    }
    const now = Date.now();
    const giftId = crypto.randomUUID();
    const gift = {
      id: giftId, giftType, senderId: userId,
      senderName: [user.firstName,user.lastName].filter(Boolean).join(" ").trim() || "Пользователь MAX",
      recipientId, recipientName: "", ownerId: null, status: "sent",
      message: typeof body.message === "string" ? body.message.slice(0, 500) : "",
      revealDelaySeconds, createdAt: now, lastSentAt: now, transferCount: 1,
      claimedAt: null, opensAt: null, pickupExpiresAt: null, expiresAt: null, openedAt: null,
      forwardedFrom: null,
      shareUrl: process.env.MAX_MINI_APP_URL
        ? process.env.MAX_MINI_APP_URL + (process.env.MAX_MINI_APP_URL.includes("?") ? "&" : "?") + "gift=" + giftId
        : null
    };
    const result = await client.eval(
      "local credits=tonumber(redis.call('GET',KEYS[1]) or '0'); if credits<1 then return -1 end; if redis.call('EXISTS',KEYS[2])==1 then return -2 end; redis.call('DECR',KEYS[1]); redis.call('SET',KEYS[2],ARGV[1]); redis.call('RPUSH',KEYS[3],ARGV[2]); redis.call('RPUSH',KEYS[4],ARGV[2]); return credits-1",
      ["gift-credits:" + userId, "gift:" + giftId, "gifts:sent:" + userId, "gifts:received:" + recipientId],
      [JSON.stringify(gift), giftId]
    );
    if (Number(result) === -1) return giftError(409, "no_free_gifts_remaining");
    if (Number(result) < 0) return giftError(409, "gift_creation_conflict");
    let notificationSent = false;
    if (gift.shareUrl) {
      try {
        await sendMaxMessage(recipientId, "🎁 Вам отправили подарок в ЛовиДай! Откройте мини-приложение по кнопке ниже. После перехода по ссылке у вас будет 12 часов, чтобы забрать подарок. Если отправитель установил таймер, он отдельно определяет, когда можно будет увидеть содержимое.",
          [[{ type: "open_app", text: "Открыть подарок", web_app: gift.shareUrl }]]);
        notificationSent = true;
      } catch (error) { console.warn("[gift notification]", error.message); }
    }
    return { statusCode: 201, body: { ok: true, gift, giftCredits: Number(result), notificationSent } };
  }

  if (path === "/api/gifts/keep") {
    const giftId = String(body?.giftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(giftId)) return giftError(400, "invalid_gift_id");
    const now = Date.now();
    const previousGift = await readGift(giftId);
    const wasAlreadyKept = previousGift?.status === "kept";
    const previousSenderId = String(previousGift?.senderId || "");
    const result = await client.eval(
      "local raw=redis.call('GET',KEYS[1]); if not raw then return 'missing' end; local g=cjson.decode(raw); if tostring(g.recipientId or '')~=ARGV[1] then return 'not_owner' end; if g.status=='opened' and tonumber(g.expiresAt or 0)>0 and tonumber(g.expiresAt)<tonumber(ARGV[2]) then g.status='expired'; g.expiredAt=tonumber(ARGV[2]); redis.call('SET',KEYS[1],cjson.encode(g)); return 'expired' end; if g.status=='kept' then return 'already:'..cjson.encode(g) end; if g.status~='opened' and g.status~='owned' then return 'not_keepable' end; g.status='kept'; g.keptAt=tonumber(ARGV[2]); g.ownerId=ARGV[1]; redis.call('SET',KEYS[1],cjson.encode(g)); return cjson.encode(g)",
      ["gift:" + giftId], [userId, now]
    );
    if (result === "missing") return giftError(404, "gift_not_found");
    if (result === "not_owner") return giftError(403, "not_gift_recipient");
    if (result === "not_keepable") return giftError(409, "gift_not_keepable");
    if (result === "expired") return giftError(409, "gift_decision_window_expired");
    const alreadyKept = String(result).startsWith("already:");
    const gift = JSON.parse(alreadyKept ? String(result).slice(8) : result);
    const notifySenderId = String(gift.senderId || previousSenderId);
    let senderNotified = false;
    if (!alreadyKept && /^\d+$/.test(notifySenderId) && notifySenderId !== userId) {
      try {
        await sendMaxMessage(notifySenderId, "💚 Ваш подарок в ЛовиДай оставили себе! Получатель решил сохранить его в своей коллекции.");
        senderNotified = true;
      } catch (error) { console.warn("[gift kept notification]", error.message); }
    }
    return { statusCode: 200, body: { ok: true, gift, senderNotified } };
  }

  if (path === "/api/gifts/claim") {
    const giftId = String(body?.giftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(giftId)) return giftError(400, "invalid_gift_id");
    const now = Date.now();
    const eventId = crypto.randomUUID();
    const currentGift = await readGift(giftId);
    if (!currentGift) return giftError(404, "gift_not_found");
    const senderId = String(currentGift.senderId || "");
    const recipientName = [user.firstName,user.lastName].filter(Boolean).join(" ").trim() || "Пользователь MAX";
    const result = await client.eval(
      "local raw=redis.call('GET',KEYS[1]); if not raw then return 'missing' end; local g=cjson.decode(raw); if g.status=='claimed' or g.status=='opened' or g.status=='kept' or g.status=='owned' then if tostring(g.recipientId or '')==ARGV[1] then return 'already:'..cjson.encode(g) end; return 'claimed' end; if g.status~='sent' then return 'not_claimable' end; if g.recipientId and g.recipientId~=cjson.null and tostring(g.recipientId)~='' and tostring(g.recipientId)~=ARGV[1] then return 'wrong_recipient' end; local sender=tostring(g.senderId or ''); if sender==ARGV[1] then return 'self_claim' end; local pickup=0; if g.pickupExpiresAt and g.pickupExpiresAt~=cjson.null then pickup=tonumber(g.pickupExpiresAt) or 0 end; if pickup==0 then return 'not_opened' end; if pickup<=tonumber(ARGV[3]) then g.status='expired'; g.expiredReason='pickup_timeout'; g.expiredAt=tonumber(ARGV[3]); redis.call('SET',KEYS[1],cjson.encode(g)); redis.call('LREM',KEYS[6],0,ARGV[4]); redis.call('LREM',KEYS[3],0,ARGV[4]); return 'expired' end; if not g.opensAt or g.opensAt==cjson.null or tonumber(g.opensAt)==0 then g.opensAt=tonumber(ARGV[3])+tonumber(g.revealDelaySeconds or 0)*1000 end; g.recipientId=ARGV[1]; g.recipientName=ARGV[2]; g.ownerId=ARGV[1]; g.claimedAt=tonumber(ARGV[3]); g.pickupExpiresAt=cjson.null; g.status='claimed'; g.expiresAt=cjson.null; redis.call('SET',KEYS[1],cjson.encode(g)); if not redis.call('LPOS',KEYS[3],ARGV[4]) then redis.call('RPUSH',KEYS[3],ARGV[4]); end; redis.call('LREM',KEYS[6],0,ARGV[4]); if sender~='' and sender~='purchase' and sender~='podaris' and sender~=ARGV[1] then redis.call('LREM',KEYS[2],0,ARGV[4]); local ev={id=ARGV[5],gift=g,senderId=sender,recipientId=ARGV[1],sentAt=tonumber(g.lastSentAt or g.createdAt or ARGV[3]),claimedAt=tonumber(ARGV[3]),eventType='claimed'}; redis.call('SET',KEYS[5],cjson.encode(ev)); redis.call('RPUSH',KEYS[4],ARGV[5]); end; return 'ok:'..cjson.encode(g)",
      ["gift:" + giftId, "gifts:sent:" + senderId, "gifts:received:" + userId, "gifts:history:" + senderId, "gift-event:" + eventId, "gifts:link-incoming:" + userId],
      [userId, recipientName, now, giftId, eventId]
    );
    if (result === "missing") return giftError(404, "gift_not_found");
    if (result === "claimed") return giftError(409, "gift_already_claimed");
    if (result === "not_claimable") return giftError(409, "gift_not_claimable");
    if (result === "not_opened") return giftError(409, "gift_link_not_opened");
    if (result === "expired") return giftError(409, "gift_expired");
    if (result === "wrong_recipient") return giftError(403, "not_gift_recipient");
    if (result === "self_claim") return giftError(409, "gift_self_claim_not_allowed");
    const already = String(result).startsWith("already:");
    const giftJson = String(result).slice(already ? 8 : 3);
    const gift = JSON.parse(giftJson);
    let senderNotified = false;
    if (!already && senderId && senderId !== userId) {
      try {
        const senderMessage = gift.status === "opened"
          ? "🎉 Ваш подарок в ЛовиДай забрали — он уже открыт и находится в коллекции получателя."
          : "🎉 Ваш подарок в ЛовиДай забрали! Он находится в коллекции получателя и откроется, когда закончится установленный вами таймер.";
        await sendMaxMessage(senderId, senderMessage);
        senderNotified = true;
      } catch (error) { console.warn("[gift claimed notification]", error.message); }
    }
    return { statusCode: 200, body: { ok: true, gift, alreadyClaimed: already, senderNotified } };
  }

  if (path === "/api/gifts/open") {
    const giftId = String(body?.giftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(giftId)) return giftError(400, "invalid_gift_id");
    const now = Date.now();
    const previousGift = await readGift(giftId);
    const wasAlreadyOpened = previousGift?.status === "opened";
    const previousSenderId = String(previousGift?.senderId || "");
    const result = await client.eval(
      "local raw=redis.call('GET',KEYS[1]); if not raw then return 'missing' end; local g=cjson.decode(raw); if tostring(g.recipientId or '')~=ARGV[1] then return 'not_owner' end; if g.status=='expired' then return 'expired:'..cjson.encode(g) end; if g.status=='opened' then if tonumber(g.expiresAt or 0)>0 and tonumber(g.expiresAt)<tonumber(ARGV[2]) then g.status='expired'; g.expiredAt=tonumber(ARGV[2]); redis.call('SET',KEYS[1],cjson.encode(g)); return 'expired:'..cjson.encode(g) end; return 'already:'..cjson.encode(g) end; if g.status~='claimed' then return 'not_ready' end; if tonumber(g.opensAt or 0)>tonumber(ARGV[2]) then return 'not_ready' end; g.status='opened'; g.openedAt=tonumber(ARGV[2]); g.expiresAt=tonumber(ARGV[2])+43200000; g.ownerId=ARGV[1]; redis.call('SET',KEYS[1],cjson.encode(g)); return cjson.encode(g)",
      ["gift:" + giftId], [userId, now]
    );
    if (result === "missing") return giftError(404, "gift_not_found");
    if (result === "not_owner") return giftError(403, "not_gift_recipient");
    if (result === "not_ready") {
      const gift = await readGift(giftId);
      return giftError(409, "gift_not_ready", { opensAt: gift?.opensAt || null });
    }
    if (String(result).startsWith("expired:")) {
      return { statusCode: 200, body: { ok: true, expired: true, gift: JSON.parse(String(result).slice(8)) } };
    }
    const alreadyOpened = String(result).startsWith("already:");
    const gift = JSON.parse(alreadyOpened ? String(result).slice(8) : result);
    const notifySenderId = String(gift.senderId || previousSenderId);
    let senderNotified = false;
    if (!alreadyOpened && /^\d+$/.test(notifySenderId) && notifySenderId !== userId) {
      try {
        await sendMaxMessage(notifySenderId, "🎉 Ваш подарок в ЛовиДай открыли! Получатель открыл подарок и теперь может принять решение, оставить его себе или передать дальше.");
        senderNotified = true;
      } catch (error) { console.warn("[gift opened notification]", error.message); }
    }
    return { statusCode: 200, body: { ok: true, gift, senderNotified } };
  }

  if (path === "/api/gifts/forward") {
    if (!fullyAuthorized) return giftError(403, "full_authorization_required");
    const giftId = String(body?.giftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(giftId)) return giftError(400, "invalid_gift_id");
    const shareByLink = body?.shareLink === true;
    const newRecipientId = shareByLink ? "" : String(body?.recipientId || "");
    const revealDelaySeconds = Number(body?.revealDelaySeconds ?? 0);
    if (!Number.isInteger(revealDelaySeconds) || revealDelaySeconds < 0 || revealDelaySeconds > 30 * 24 * 60 * 60) return giftError(400, "invalid_reveal_delay");
    if (!shareByLink && (!/^\d+$/.test(newRecipientId) || newRecipientId === userId)) return giftError(400, "invalid_recipient");
    const now = Date.now();
    const previousGift = await readGift(giftId);
    const previousSenderId = String(previousGift?.senderId || "");
    const senderName = [user.firstName,user.lastName].filter(Boolean).join(" ").trim() || "Пользователь MAX";
    const shareUrl = shareByLink
      ? "https://max.ru/se14711525_1_bot?startapp=gift_" + giftId
      : (process.env.MAX_MINI_APP_URL
        ? process.env.MAX_MINI_APP_URL + (process.env.MAX_MINI_APP_URL.includes("?") ? "&" : "?") + "gift=" + giftId
        : null);
    const result = await client.eval(
      "local raw=redis.call('GET',KEYS[1]); if not raw then return 'missing' end; local g=cjson.decode(raw); if tostring(g.recipientId or '')~=ARGV[1] then return 'not_owner' end; if g.status=='opened' and tonumber(g.expiresAt or 0)>0 and tonumber(g.expiresAt)<tonumber(ARGV[4]) then g.status='expired'; g.expiredAt=tonumber(ARGV[4]); redis.call('SET',KEYS[1],cjson.encode(g)); return 'expired' end; if g.status~='opened' and g.status~='owned' and g.status~='kept' then return 'not_forwardable' end; g.originSenderId=g.originSenderId or g.senderId or ''; g.originSenderName=g.originSenderName or g.senderName or ''; g.senderId=ARGV[1]; g.senderName=ARGV[2]; g.recipientId=(ARGV[3]=='') and cjson.null or ARGV[3]; g.recipientName=''; g.ownerId=cjson.null; g.status='sent'; g.lastSentAt=tonumber(ARGV[4]); g.transferCount=tonumber(g.transferCount or 0)+1; g.claimedAt=cjson.null; g.opensAt=cjson.null; g.pickupExpiresAt=cjson.null; g.expiresAt=cjson.null; g.openedAt=cjson.null; g.keptAt=cjson.null; g.revealDelaySeconds=tonumber(ARGV[7]); g.shareUrl=(ARGV[5]=='') and cjson.null or ARGV[5]; redis.call('SET',KEYS[1],cjson.encode(g)); redis.call('LREM',KEYS[2],0,ARGV[6]); redis.call('RPUSH',KEYS[3],ARGV[6]); if ARGV[3]~='' then redis.call('RPUSH',KEYS[4],ARGV[6]); end; return cjson.encode(g)",
      ["gift:" + giftId, "gifts:received:" + userId, "gifts:sent:" + userId, "gifts:received:" + (newRecipientId || "none")],
      [userId, senderName, newRecipientId, now, shareUrl || "", giftId, revealDelaySeconds]
    );
    if (result === "missing") return giftError(404, "gift_not_found");
    if (result === "not_owner") return giftError(403, "not_gift_recipient");
    if (result === "not_forwardable") return giftError(409, "gift_not_forwardable");
    if (result === "expired") return giftError(409, "gift_decision_window_expired");
    const gift = JSON.parse(result);
    let previousSenderNotified = false;
    if (/^\d+$/.test(previousSenderId) && previousSenderId !== userId && previousSenderId !== newRecipientId) {
      try {
        await sendMaxMessage(previousSenderId, "🔁 Ваш подарок в ЛовиДай переслали другому человеку. Подарок продолжил путь к новому получателю.");
        previousSenderNotified = true;
      } catch (error) { console.warn("[gift forwarded-to-sender notification]", error.message); }
    }
    let notificationSent = false;
    if (newRecipientId && gift.shareUrl) {
      try {
        await sendMaxMessage(newRecipientId, "🎁 Вам отправили подарок в ЛовиДай! Откройте мини-приложение по кнопке ниже. После перехода по ссылке у вас будет 12 часов, чтобы забрать подарок. Таймер до показа, если он установлен, считается отдельно.",
          [[{ type: "open_app", text: "Открыть подарок", web_app: gift.shareUrl }]]);
        notificationSent = true;
      } catch (error) { console.warn("[forward notification]", error.message); }
    }
    return { statusCode: 201, body: { ok: true, gift, notificationSent, previousSenderNotified, shareByLink } };
  }

  return giftError(404, "gift_route_not_found");
}


function shopCatalogItem(sku) {
  const single = /^joystick_([1-6])$/.exec(String(sku || ""));
  if (single) return { amount: 200, items: [{ giftType: "joystick_" + single[1], quantity: 1 }] };
  const loviday = {
    loviday_love: "loviday_love",
    loviday: "loviday",
    loviday_friend: "loviday_friend",
    loviday_steel: "loviday_steel",
    loviday_cyber: "loviday_cyber"
  };
  if (loviday[sku]) return { amount: sku === "loviday" ? 50 : 100, items: [{ giftType: loviday[sku], quantity: 1 }] };
  if (sku === "loviday_collection") {
    return { amount: 599, items: Object.values(loviday).map(giftType => ({ giftType, quantity: 1 })) };
  }
  if (sku === "joystick_collection") {
    return { amount: 999, items: [1, 2, 3, 4, 5, 6].map(number => ({ giftType: "joystick_" + number, quantity: 1 })) };
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
      targets: "ЛовиДай — подарок",
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
  const lockToken = crypto.randomUUID();
  const lock = await client.set(lockKey, lockToken, { nx: true, px: 60000 });
  if (lock !== "OK") return { statusCode: 200, body: { ok: true, processing: true } };
  try {
    const latestRaw = await client.get(orderKey);
    const latest = latestRaw ? JSON.parse(latestRaw) : null;
    if (!latest) return { statusCode: 404, body: { ok: false, error: "order_not_found" } };
    if (latest.status === "paid") return { statusCode: 200, body: { ok: true, alreadyProcessed: true } };

    for (const item of latest.items || []) {
      const quantity = Math.max(0, Math.min(20, Number(item.quantity) || 0));
      if (!(/^(joystick_[1-6]|loviday(_love|_friend|_steel|_cyber)?)$/.test(String(item.giftType || ""))) || quantity < 1) {
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
        gift.ownerId = String(latest.userId);
        await client.eval(
          "if redis.call('EXISTS',KEYS[1])==0 then redis.call('SET',KEYS[1],ARGV[1]); end; if not redis.call('LPOS',KEYS[2],ARGV[2]) then redis.call('RPUSH',KEYS[2],ARGV[2]); end; return 1",
          ["gift:" + gift.id, "gifts:received:" + latest.userId],
          [JSON.stringify(gift), gift.id]
        );
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
    await client.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0", [lockKey], [lockToken]);
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
    const result = await maxApiFetch("https://platform-api2.max.ru/subscriptions", { method: "GET", headers: { Authorization: process.env.MAX_BOT_TOKEN } });
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
    const listResponse = await maxApiFetch("https://platform-api2.max.ru/subscriptions", {
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
    // POST /subscriptions updates the event types for an existing webhook URL.
    const registerResponse = await maxApiFetch("https://platform-api2.max.ru/subscriptions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: webhookUrl,
        update_types: ["bot_started", "message_created", "message_callback", "bot_added", "bot_removed"],
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

    const verifyResponse = await maxApiFetch("https://platform-api2.max.ru/subscriptions", {
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

    await recordAdminLog("info", "max-subscriptions", "Webhook ЛовиДай успешно зарегистрирован в MAX", {
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

async function recordUserVisit(userId, state = {}) {
  const client = await getRedis();
  const entry = {
    at: new Date().toISOString(),
    consentAccepted: Boolean(state.consentAccepted),
    fullyAuthorized: Boolean(state.fullyAuthorized),
    contactProvided: Boolean(state.contactProvided),
    source: "mini_app"
  };
  const key = "user:visits:" + userId;
  await client.rPush(key, JSON.stringify(entry));
  await client.lTrim(key, -100, -1);
}

async function listAdminUserIds(client) {
  const ids = new Set((await client.sMembers("users:index")).map(String));
  let cursor = "0";
  do {
    const result = await client.scan(cursor, "user:*", 500);
    if (!Array.isArray(result) || result.length < 2) break;
    cursor = String(result[0]);
    for (const key of result[1] || []) {
      const match = /^user:(\d+)$/.exec(String(key));
      if (match) ids.add(match[1]);
    }
  } while (cursor !== "0");
  return [...ids];
}

async function handleAdminUsers() {
  const client = await getRedis();
  const ids = await listAdminUserIds(client);
  const users = [];
  for (const id of ids) {
    const raw = await client.get("user:" + id);
    if (!raw) continue;
    let user;
    try { user = JSON.parse(raw); } catch { continue; }
    const [consent, contact, giftIds, visitRaw] = await Promise.all([
      client.get("consent:" + id),
      client.get("contact:" + id),
      client.lRange("gifts:received:" + id, 0, -1),
      client.lRange("user:visits:" + id, -1, -1)
    ]);
    const currentGiftRecords = await Promise.all([...new Set(giftIds)].map(giftId => client.get("gift:" + giftId)));
    const ownedGiftCount = currentGiftRecords.map(rawGift => {
      try { return rawGift ? JSON.parse(rawGift) : null; } catch { return null; }
    }).filter(gift => gift && ["owned","claimed","opened","kept"].includes(gift.status) && String(gift.recipientId || "") === String(id)).length;
    let consentData = null;
    let contactData = null;
    let lastVisit = null;
    try { consentData = consent ? JSON.parse(consent) : null; } catch {}
    try { contactData = contact ? JSON.parse(contact) : null; } catch {}
    try { lastVisit = visitRaw[0] ? JSON.parse(visitRaw[0]) : null; } catch {}
    users.push({
      id,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Пользователь MAX",
      username: user.username || null,
      photoUrl: user.photoUrl || null,
      createdAt: user.createdAt || null,
      updatedAt: user.updatedAt || null,
      lastVisitAt: lastVisit?.at || user.updatedAt || null,
      consentAccepted: consentData ? consentData.agreementVersion === AGREEMENT_VERSION && consentData.privacyVersion === PRIVACY_VERSION : false,
      contactProvided: Boolean(contactData?.phone),
      fullyAuthorized: Boolean(consentData && consentData.agreementVersion === AGREEMENT_VERSION && consentData.privacyVersion === PRIVACY_VERSION && contactData?.phone),
      giftsCount: ownedGiftCount
    });
  }
  users.sort((a,b) => String(b.lastVisitAt || b.updatedAt || "").localeCompare(String(a.lastVisitAt || a.updatedAt || "")));
  return { statusCode: 200, body: { ok: true, users, total: users.length } };
}

async function handleAdminUserDetail(userId) {
  if (!/^\d+$/.test(String(userId || ""))) return { statusCode: 400, body: { ok: false, error: "invalid_user_id" } };
  const client = await getRedis();
  const raw = await client.get("user:" + userId);
  if (!raw) return { statusCode: 404, body: { ok: false, error: "user_not_found" } };
  const user = JSON.parse(raw);
  const [consentRaw, contactRaw, receivedIds, sentIds, historyIds, visitsRaw] = await Promise.all([
    client.get("consent:" + userId),
    client.get("contact:" + userId),
    client.lRange("gifts:received:" + userId, 0, -1),
    client.lRange("gifts:sent:" + userId, 0, -1),
    client.lRange("gifts:history:" + userId, 0, -1),
    client.lRange("user:visits:" + userId, 0, -1)
  ]);
  let consent = null, contact = null;
  try { consent = consentRaw ? JSON.parse(consentRaw) : null; } catch {}
  try { contact = contactRaw ? JSON.parse(contactRaw) : null; } catch {}
  const fullyAuthorized = Boolean(consent && consent.agreementVersion === AGREEMENT_VERSION && consent.privacyVersion === PRIVACY_VERSION && contact?.phone);
  const allIds = [...new Set([...receivedIds, ...sentIds, ...historyIds])];
  const gifts = [];
  for (const giftId of allIds) {
    const eventRaw = historyIds.includes(giftId) ? await client.get("gift-event:" + giftId) : null;
    const giftRaw = eventRaw || await client.get("gift:" + giftId);
    if (!giftRaw) continue;
    try {
      const parsed = JSON.parse(giftRaw);
      const gift = eventRaw && parsed.gift ? { ...parsed.gift, historyEventId: parsed.id } : parsed;
      let sender = null;
      if (/^\d+$/.test(String(gift.senderId || ""))) {
        const senderRaw = await client.get("user:" + gift.senderId);
        try { const senderUser = senderRaw ? JSON.parse(senderRaw) : null; sender = senderUser ? ([senderUser.firstName,senderUser.lastName].filter(Boolean).join(" ") || senderUser.username || gift.senderId) : gift.senderId; } catch { sender = gift.senderId; }
      } else sender = gift.senderId === "podaris" ? "ЛовиДай (стартовый)" : gift.senderId === "purchase" ? "Покупка в магазине" : gift.senderId || "Неизвестно";
      gifts.push({ id: gift.id, giftType: gift.giftType, status: gift.status, sender, senderId: gift.senderId || null, recipientId: gift.recipientId || null, createdAt: gift.createdAt || null, source: gift.source || null });
    } catch {}
  }
  const currentGiftRecords = await Promise.all([...new Set(receivedIds)].map(giftId => client.get("gift:" + giftId)));
  const ownedGiftCount = currentGiftRecords.map(rawGift => {
    try { return rawGift ? JSON.parse(rawGift) : null; } catch { return null; }
  }).filter(gift => gift && ["owned","claimed","opened","kept"].includes(gift.status) && String(gift.recipientId || "") === String(userId)).length;
  const visits = visitsRaw.map(item => { try { return JSON.parse(item); } catch { return null; } }).filter(Boolean);
  return {
    statusCode: 200,
    body: {
      ok: true,
      user: { id: String(userId), name: [user.firstName,user.lastName].filter(Boolean).join(" ") || user.username || "Пользователь MAX", username: user.username || null, photoUrl: user.photoUrl || null, createdAt: user.createdAt || null, updatedAt: user.updatedAt || null },
      authorization: { consentAccepted: Boolean(consent && consent.agreementVersion === AGREEMENT_VERSION && consent.privacyVersion === PRIVACY_VERSION), contactProvided: Boolean(contact?.phone), fullyAuthorized, authorizedAt: contact?.sharedAt || null },
      gifts,
      giftsCount: ownedGiftCount,
      visits
    }
  };
}


async function handleAdminGrantGift(userId, giftType, adminUser) {
  const id = String(userId || "");
  const type = String(giftType || "");
  if (!/^[0-9]+$/.test(id)) return { statusCode: 400, body: { ok: false, error: "invalid_user_id" } };
  if (!/^(joystick_[1-6]|loviday(_love|_friend|_steel|_cyber)?)$/.test(type)) return { statusCode: 400, body: { ok: false, error: "invalid_gift_type" } };
  const client = await getRedis();
  if (!(await client.get("user:" + id))) return { statusCode: 404, body: { ok: false, error: "user_not_found" } };
  const now = Date.now();
  const giftId = crypto.randomUUID();
  const gift = {
    id: giftId, giftType: type, senderId: String(adminUser.id),
    senderName: "Администратор", recipientId: id, recipientName: "",
    ownerId: id, status: "owned", message: "Подарок от администрации ЛовиДай",
    revealDelaySeconds: 0, createdAt: now, claimedAt: null, opensAt: null,
    expiresAt: null, openedAt: null, forwardedFrom: null, shareUrl: null,
    source: "admin_grant", grantedBy: String(adminUser.id)
  };
  const created = await client.eval(
    "if redis.call('EXISTS',KEYS[1])==1 then return 0 end; redis.call('SET',KEYS[1],ARGV[1]); if not redis.call('LPOS',KEYS[2],ARGV[2]) then redis.call('RPUSH',KEYS[2],ARGV[2]); end; return 1",
    ["gift:" + giftId, "gifts:received:" + id],
    [JSON.stringify(gift), giftId]
  );
  if (Number(created) !== 1) return { statusCode: 409, body: { ok: false, error: "gift_creation_conflict" } };
  await recordAdminLog("info", "admin", "Подарок выдан пользователю", { adminId: String(adminUser.id), userId: id, giftId, giftType: type });
  return { statusCode: 200, body: { ok: true, gift: { id: giftId, giftType: type, recipientId: id, status: "owned" } } };
}

async function handleAdminResetUser(userId, confirmation) {
  const id = String(userId || "");
  if (!/^\d+$/.test(id)) return { statusCode: 400, body: { ok: false, error: "invalid_user_id" } };
  if (String(confirmation || "") !== "RESET:" + id) {
    return { statusCode: 400, body: { ok: false, error: "reset_confirmation_mismatch" } };
  }
  const client = await getRedis();
  const userRaw = await client.get("user:" + id);
  if (!userRaw) return { statusCode: 404, body: { ok: false, error: "user_not_found" } };
  const lockKey = "admin:account-reset-lock:" + id;
  const lockToken = crypto.randomUUID();
  const lock = await client.set(lockKey, lockToken, { nx: true, px: 120000 });
  if (lock !== "OK") return { statusCode: 409, body: { ok: false, error: "account_reset_in_progress" } };
  try {
    const receivedIds = [...new Set((await client.lRange("gifts:received:" + id, 0, -1)).map(String))];
    let discardedGifts = 0;
    let cancelledIncoming = 0;
    for (const giftId of receivedIds) {
      const currentRaw = await client.get("gift:" + giftId);
      let currentGift = null;
      try { currentGift = currentRaw ? JSON.parse(currentRaw) : null; } catch {}
      const senderId = String(currentGift?.senderId || "");
      const eventId = crypto.randomUUID();
      const result = await client.eval(
        "local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local g=cjson.decode(raw); if tostring(g.recipientId or '')~=ARGV[1] then return 0 end; local oldStatus=tostring(g.status or ''); if oldStatus~='sent' and oldStatus~='claimed' and oldStatus~='opened' and oldStatus~='owned' and oldStatus~='kept' and oldStatus~='expired' then return 0 end; local sender=tostring(g.senderId or ''); g.status='reset_discarded'; g.ownerId=cjson.null; g.recipientId=cjson.null; g.recipientName=''; g.resetAt=tonumber(ARGV[2]); g.resetReason='recipient_account_reset'; redis.call('SET',KEYS[1],cjson.encode(g)); if oldStatus=='sent' and sender~='' and sender~='podaris' and sender~='purchase' and sender~=ARGV[1] then local ev={id=ARGV[3],gift=g,senderId=sender,recipientId=ARGV[1],sentAt=tonumber(g.lastSentAt or g.createdAt or ARGV[2]),resetAt=tonumber(ARGV[2]),eventType='recipient_account_reset'}; redis.call('SET',KEYS[2],cjson.encode(ev)); redis.call('RPUSH',KEYS[3],ARGV[3]); end; return oldStatus=='sent' and 2 or 1",
        ["gift:" + giftId, "gift-event:" + eventId, "gifts:history:" + (senderId || "none")],
        [id, Date.now(), eventId]
      );
      if (Number(result) === 1) discardedGifts += 1;
      if (Number(result) === 2) { discardedGifts += 1; cancelledIncoming += 1; }
    }
    await client.eval(
      "return redis.call('DEL',unpack(KEYS))",
      ["consent:" + id,"contact:" + id,"user:visits:" + id,"gifts:received:" + id,"gifts:sent:" + id,"gifts:history:" + id,"gift-credits:" + id],
      []
    );
    await recordAdminLog("warning", "admin", "Аккаунт пользователя обнулён", {
      userId: id, discardedGifts, cancelledIncoming,
      starterGrantPreserved: Boolean(await client.get("starter-gifts:" + id)),
      paymentOrdersPreserved: true
    });
    return {
      statusCode: 200,
      body: {
        ok: true, userId: id, discardedGifts, cancelledIncoming,
        authorizationReset: true, visitHistoryCleared: true,
        sentGiftsToOtherUsersPreserved: true, paymentOrdersPreserved: true
      }
    };
  } finally {
    await client.del(lockKey);
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
      appName: "ЛовиДай",
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
        ok: true, service: "podaris-api", runtime: "yandex-cloud-functions", build: "a36be91",
        redis: "ok", maxBotConfigured: Boolean(process.env.MAX_BOT_TOKEN),
        webhookSecretConfigured: Boolean(process.env.MAX_WEBHOOK_SECRET),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[health check]", error.message);
      return response(503, {
        ok: false, service: "podaris-api",
        redis: process.env.REDIS_URL || (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ? "unavailable" : "not_configured",
        maxBotConfigured: Boolean(process.env.MAX_BOT_TOKEN)
      });
    }
  }

  if (method === "POST" && ["/api/auth", "/api/consent/status", "/api/consent/accept", "/api/gifts/list", "/api/gifts/link-preview", "/api/gifts/send", "/api/gifts/claim", "/api/gifts/open", "/api/gifts/keep", "/api/gifts/forward", "/api/shop/order", "/api/admin/status", "/api/admin/diagnostics", "/api/admin/register-webhook", "/api/admin/logs", "/api/admin/users", "/api/admin/user", "/api/admin/user/reset", "/api/admin/user/gift", "/api/gifts/starter/status", "/api/gifts/starter/verify-subscription"].includes(path)) {
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
        if (path === "/api/admin/users") {
          const users = await handleAdminUsers();
          return response(users.statusCode, users.body);
        }
        if (path === "/api/admin/user") {
          const detail = await handleAdminUserDetail(body?.userId);
          return response(detail.statusCode, detail.body);
        }
        if (path === "/api/admin/user/reset") {
          const reset = await handleAdminResetUser(body?.userId, body?.confirmation);
          return response(reset.statusCode, reset.body);
        }
        if (path === "/api/admin/user/gift") {
          const grant = await handleAdminGrantGift(body?.userId, body?.giftType, user);
          return response(grant.statusCode, grant.body);
        }
        return response(404, { error: "admin_route_not_found" });
      }
      if (path === "/api/auth") {
        const consent = await getConsent(user.id);
        const contact = await getSavedContact(user.id);
        const fullyAuthorized = consentIsCurrent(consent) && Boolean(contact?.phone);
        const giftCredits = await getGiftBalance(user.id);
        await recordUserVisit(user.id, { consentAccepted: consentIsCurrent(consent), fullyAuthorized, contactProvided: Boolean(contact?.phone) });
        return response(200, {
          ok: true, user, consentRequired: !consentIsCurrent(consent),
          fullyAuthorized, contactRequired: !contact?.phone, giftCredits
        });
      }
      if (path === "/api/gifts/starter/status") {
        const [consent, contact, channelId] = await Promise.all([
          getConsent(user.id), getSavedContact(user.id), (await getRedis()).get("podaris:loviday:channel_id")
        ]);
        const redis = await getRedis();
        const legacy = Boolean(await redis.get("starter-gifts:" + user.id));
        // Backfill only milestones already demonstrably completed before this release.
        if (consentIsCurrent(consent)) await grantStarterMilestoneGift(user.id, "consent");
        if (contact?.phone) await grantStarterMilestoneGift(user.id, "contact");
        const milestones = {};
        for (const name of ["consent","contact","channel"]) {
          const marker = await (await getRedis()).get("starter-milestone:" + user.id + ":" + name);
          milestones[name] = Boolean(marker || (legacy && ["consent","contact","channel"].includes(name)));
        }
        milestones.consent = milestones.consent || consentIsCurrent(consent);
        milestones.contact = milestones.contact || Boolean(contact?.phone);
        return response(200, { ok:true, milestones, channelConfigured:Boolean(channelId), channelUrl:"https://max.ru/channel_loviday", legacyBundle:legacy });
      }
      if (path === "/api/gifts/starter/verify-subscription") {
        const consent = await getConsent(user.id);
        if (!consentIsCurrent(consent)) return response(403, { ok:false, error:"consent_required" });
        const client = await getRedis();
        const [contact, channelId] = await Promise.all([getSavedContact(user.id), client.get("podaris:loviday:channel_id")]);
        if (!contact?.phone) return response(403, { ok:false, error:"contact_required" });
        if (!channelId) return response(503, { ok:false, error:"channel_not_configured" });
        const check = await maxApiFetch("https://platform-api2.max.ru/chats/" + encodeURIComponent(String(channelId)) + "/members?user_ids=" + encodeURIComponent(String(user.id)), {
          headers: { "Authorization": process.env.MAX_BOT_TOKEN }
        });
        const data = await check.json();
        if (!check.ok) {
          await recordAdminLog("warning","channel-subscription","Не удалось проверить подписку пользователя MAX",{userId:String(user.id),status:check.status});
          return response(check.status === 429 ? 429 : 502, { ok:false, error:check.status === 403 ? "channel_members_access_denied" : "subscription_check_failed" });
        }
        const members = Array.isArray(data.members) ? data.members : Array.isArray(data) ? data : [];
        const subscribed = members.some(member => String(member.user_id ?? member.user?.user_id ?? member.user?.id ?? member.id ?? "") === String(user.id));
        if (!subscribed) return response(200, { ok:true, subscribed:false, granted:false, message:"Подпишитесь на канал и повторите проверку." });
        const reward = await grantStarterMilestoneGift(user.id, "channel");
        await recordAdminLog("info","channel-subscription","Подписка пользователя подтверждена; третий подарок начислен или уже был выдан",{userId:String(user.id),granted:reward.granted===true});
        return response(200, { ok:true, subscribed:true, granted:reward.granted===true, alreadyGranted:reward.alreadyGranted===true || reward.legacy===true });
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
        const [consent, contact] = await Promise.all([
          getConsent(user.id),
          getSavedContact(user.id)
        ]);
        const accepted = consentIsCurrent(consent);
        const fullyAuthorized = accepted && Boolean(contact?.phone);
        const adminIds = new Set(String(process.env.ADMIN_MAX_IDS || "").split(",").map(value => value.trim()).filter(Boolean));
        return response(200, {
          ok: true,
          accepted,
          required: !accepted,
          contactRequired: accepted && !contact?.phone,
          fullyAuthorized,
          isAdmin: adminIds.has(String(user.id)),
          versions: currentConsentVersions(),
          legal: {
            agreementUrl: LEGAL_BASE_URL + "/user-agreement.html",
            privacyUrl: LEGAL_BASE_URL + "/privacy-policy.html"
          },
          user,
          consent: accepted ? consent : null
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
      const message = String(error?.message || error || "unknown_error");
      console.error("[api request failed]", { path, userId: String(auth.user?.user_id ?? auth.user?.id ?? ""), message, stack: error?.stack });
      const adminIds = new Set(String(process.env.ADMIN_MAX_IDS || "").split(",").map(value => value.trim()).filter(Boolean));
      const isAdmin = adminIds.has(String(auth.user?.user_id ?? auth.user?.id ?? ""));
      return response(503, {
        error: "storage_unavailable",
        ...(isAdmin ? { diagnostic: message.slice(0, 240), route: path } : {})
      });
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

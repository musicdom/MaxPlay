const crypto = require("node:crypto");
const { createClient } = require("redis");

let redisClient;
let redisConnectPromise;

async function getRedis() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured");
  }

  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 250, 5000)
      }
    });

    redisClient.on("error", (error) => {
      console.error("[redis]", error.message);
    });
  }

  if (!redisClient.isOpen) {
    if (!redisConnectPromise) {
      redisConnectPromise = redisClient.connect().finally(() => {
        redisConnectPromise = null;
      });
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
      "Cache-Control": "no-store"
    },
    isBase64Encoded: false,
    body: JSON.stringify(payload)
  };
}

function getRequestPath(event) {
  const rawPath = event.path || event.rawPath || event.url || "/";
  const path = String(rawPath).split("?")[0];
  if (path.length > 1) return path.replace(/\/+$/, "");
  return path;
}

function parseBody(event) {
  const body = event.body;

  if (body === undefined || body === null || body === "") {
    return {};
  }

  if (typeof body === "object") {
    return body;
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(String(body), "base64").toString("utf8")
    : String(body);

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function validateMaxInitData(initData, botToken) {
  if (typeof initData !== "string" || !initData || !botToken) {
    return { ok: false, reason: "missing_data" };
  }

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "invalid_data" };
  }

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
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken, "utf8")
    .digest();

  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(launchParams, "utf8")
    .digest();

  const actualHash = Buffer.from(receivedHash, "hex");
  if (
    actualHash.length !== expectedHash.length ||
    !crypto.timingSafeEqual(actualHash, expectedHash)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) {
    return { ok: false, reason: "invalid_auth_date" };
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAge = Number(process.env.MAX_AUTH_MAX_AGE_SECONDS || 86400);
  const futureTolerance = 60;

  if (authDate > now + futureTolerance || now - authDate > maxAge) {
    return { ok: false, reason: "auth_data_expired" };
  }

  let user;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    return { ok: false, reason: "invalid_user" };
  }

  if (!user || (typeof user.id !== "number" && typeof user.id !== "string")) {
    return { ok: false, reason: "invalid_user" };
  }

  const userId = String(user.id);
  if (!/^\d+$/.test(userId)) {
    return { ok: false, reason: "invalid_user" };
  }

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
  const key = `user:${user.id}`;
  const existingRaw = await client.get(key);

  let createdAt = new Date().toISOString();
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      if (typeof existing.createdAt === "string") createdAt = existing.createdAt;
    } catch {
      // Replace malformed legacy data with a clean user record.
    }
  }

  const record = {
    ...user,
    createdAt,
    updatedAt: new Date().toISOString()
  };

  await client.set(key, JSON.stringify(record));
  return record;
}

// Yandex Cloud Functions Node.js 22 HTTP handler.
// Configure the function entry point as: handler.handler
module.exports.handler = async function (event = {}) {
  const method = String(
    event.httpMethod || event.requestContext?.httpMethod || event.method || "GET"
  ).toUpperCase();
  const path = getRequestPath(event);

  let body;
  try {
    body = parseBody(event);
  } catch {
    return response(400, { error: "invalid_json" });
  }

  if (method === "GET" && path === "/api/config") {
    return response(200, {
      appName: "Подарис",
      platform: "MAX",
      apiBase: "/api"
    });
  }

  if (method === "GET" && path === "/api/health") {
    try {
      const client = await getRedis();
      await client.ping();

      return response(200, {
        ok: true,
        service: "podaris-api",
        runtime: "yandex-cloud-functions",
        redis: "ok",
        maxBotConfigured: Boolean(process.env.MAX_BOT_TOKEN),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[health check]", error.message);

      return response(503, {
        ok: false,
        service: "podaris-api",
        redis: process.env.REDIS_URL ? "unavailable" : "not_configured",
        maxBotConfigured: Boolean(process.env.MAX_BOT_TOKEN)
      });
    }
  }

  if (method === "POST" && path === "/api/auth") {
    if (!process.env.MAX_BOT_TOKEN) {
      return response(503, { error: "max_bot_not_configured" });
    }

    const auth = validateMaxInitData(body.initData, process.env.MAX_BOT_TOKEN);
    if (!auth.ok) {
      return response(401, { error: "unauthorized", reason: auth.reason });
    }

    try {
      const user = await saveUser(auth.user);
      return response(200, { ok: true, user });
    } catch (error) {
      console.error("[user auth]", error.message);
      return response(503, { error: "storage_unavailable" });
    }
  }

  if (method === "POST" && path === "/api/max/webhook") {
    // Do not register this URL in MAX until webhook authentication
    // and update processing have been implemented.
    return response(501, {
      error: "webhook_not_implemented",
      message: "MAX webhook integration is not ready yet"
    });
  }

  return response(404, { error: "not_found" });
};

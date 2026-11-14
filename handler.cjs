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

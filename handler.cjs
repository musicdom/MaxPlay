const { createClient } = require("redis");

let redisClient;
let redisConnectPromise;

async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 250, 5000) }
    });
    redisClient.on("error", (error) => console.error("[redis]", error.message));
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
    body: JSON.stringify(payload)
  };
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

// Yandex Cloud Functions Node.js HTTP handler.
// Configure the function entry point as: handler.handler
module.exports.handler = async function (event) {
  const method = String(event.httpMethod || event.method || "GET").toUpperCase();
  const path = event.path || event.rawPath || "/";
  const body = parseBody(event.body);

  try {
    if (method === "GET" && path === "/api/health") {
      let redis = "not_configured";
      if (process.env.REDIS_URL) {
        const client = await getRedis();
        await client.ping();
        redis = "ok";
      }
      return response(200, {
        ok: redis !== "unavailable",
        service: "podaris-api",
        runtime: "yandex-cloud-functions",
        redis,
        maxBotConfigured: Boolean(process.env.MAX_BOT_TOKEN),
        timestamp: new Date().toISOString()
      });
    }

    if (method === "GET" && path === "/api/config") {
      return response(200, {
        appName: "Подарис",
        platform: "MAX",
        apiBase: "/api"
      });
    }

    if (method === "POST" && path === "/api/max/webhook") {
      console.log("[max webhook]", JSON.stringify({
        updateType: body.update_type || body.type || "unknown",
        timestamp: new Date().toISOString()
      }));
      // Webhook is a placeholder until MAX authentication is implemented.
      return response(200, { ok: true });
    }

    return response(404, { error: "not_found" });
  } catch (error) {
    console.error("[podaris function]", error.message);
    return response(503, {
      error: "service_unavailable",
      message: "Backend dependency is temporarily unavailable"
    });
  }
};

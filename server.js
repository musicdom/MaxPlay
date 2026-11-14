import "dotenv/config";
import express from "express";
import { createClient } from "redis";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

let redisClient = null;
let redisReady = false;

if (process.env.REDIS_URL) {
  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 250, 5000)
    }
  });
  redisClient.on("error", (error) => {
    redisReady = false;
    console.error("[redis]", error.message);
  });
  redisClient.on("ready", () => {
    redisReady = true;
    console.log("[redis] connected");
  });
  try {
    await redisClient.connect();
  } catch (error) {
    console.error("[redis] initial connection failed:", error.message);
  }
}

app.get("/api/health", async (_req, res) => {
  let redis = "not_configured";
  if (redisClient) {
    try {
      await redisClient.ping();
      redis = "ok";
      redisReady = true;
    } catch {
      redis = "unavailable";
      redisReady = false;
    }
  }
  const configured = Boolean(process.env.MAX_BOT_TOKEN);
  res.status(redis === "unavailable" ? 503 : 200).json({
    ok: redis !== "unavailable",
    service: "podaris-api",
    redis,
    maxBotConfigured: configured,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    appName: "Подарис",
    platform: "MAX",
    apiBase: "/api"
  });
});

// MAX sends bot updates to this HTTPS endpoint.
// Business actions are intentionally not performed until webhook
// subscription, payload validation and bot credentials are configured.
app.post("/api/max/webhook", async (req, res) => {
  const update = req.body ?? {};
  console.log("[max webhook]", JSON.stringify({
    updateType: update.update_type ?? update.type ?? "unknown",
    timestamp: new Date().toISOString()
  }));

  // Acknowledge promptly; MAX retries unsuccessful webhook deliveries.
  res.sendStatus(200);
});

app.use(express.static(__dirname, {
  index: "index.html",
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
  res.sendFile(path.join(__dirname, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Подарис server listening on :${PORT}`);
});

async function shutdown() {
  try {
    if (redisClient?.isOpen) await redisClient.quit();
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

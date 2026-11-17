import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cloudHandler from "./handler.cjs";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Reuse the exact same API handler locally and in Yandex Cloud Functions.
app.use("/api", async (req, res, next) => {
  try {
    const result = await cloudHandler.handler({
      httpMethod: req.method,
      path: req.originalUrl.split("?")[0],
      headers: req.headers,
      body: req.body ?? {},
      isBase64Encoded: false
    });

    res.status(result.statusCode || 200);
    for (const [name, value] of Object.entries(result.headers || {})) {
      res.setHeader(name, value);
    }
    if (result.statusCode === 204) return res.end();
    return res.send(result.body || "");
  } catch (error) {
    return next(error);
  }
});

app.use(express.static(__dirname, {
  index: "index.html",
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.use((error, _req, res, _next) => {
  console.error("[server]", error.message);
  res.status(500).json({ error: "internal_server_error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ЛовиДай server listening on :" + PORT);
});

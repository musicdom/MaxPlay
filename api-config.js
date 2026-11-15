// Set this to the HTTPS URL of the Yandex Cloud Function HTTP trigger.
// Example: https://functions.yandexcloud.net/<function-id>
// Do not add /api; the app appends endpoint paths automatically.
window.PODARIS_API_BASE = "https://functions.yandexcloud.net/d4eu88tanqd001ko5llp";

// Route API calls through the single Yandex Cloud Function root (same pattern as Norka).
window.PODARIS_API_URL = function (path) {
  const base = String(window.PODARIS_API_BASE || "").replace(/\/+$/, "");
  const cleanPath = String(path || "").split("?")[0].replace(/\/+$/, "");
  if (cleanPath === "/api/health") return base + "?route=health";
  if (cleanPath === "/api/config") return base + "?route=config";
  if (cleanPath === "/api/max/webhook") return base + "?route=webhook";
  if (!cleanPath.startsWith("/api/")) throw new Error("Unknown Podaris API path");
  const endpoint = cleanPath.slice("/api/".length);
  return base + "?route=api&endpoint=" + encodeURIComponent(endpoint);
};

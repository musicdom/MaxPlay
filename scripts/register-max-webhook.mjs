import "dotenv/config";

const token = process.env.MAX_BOT_TOKEN;
const secret = process.env.MAX_WEBHOOK_SECRET;
const url = process.env.MAX_WEBHOOK_URL;

if (!token || !secret || !url) {
  console.error("Set MAX_BOT_TOKEN, MAX_WEBHOOK_SECRET and MAX_WEBHOOK_URL before registering.");
  process.exit(1);
}
if (!url.startsWith("https://")) {
  console.error("MAX_WEBHOOK_URL must use HTTPS.");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{5,256}$/.test(secret)) {
  console.error("MAX_WEBHOOK_SECRET must be 5-256 characters: A-Z, a-z, 0-9, _ or -.");
  process.exit(1);
}

const response = await fetch("https://platform-api2.max.ru/subscriptions", {
  method: "POST",
  headers: {
    "Authorization": token,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    url,
    update_types: ["bot_started", "message_created", "message_callback", "bot_added", "bot_removed"],
    secret
  })
});

const result = await response.json().catch(() => ({}));
if (!response.ok || result.success === false) {
  console.error("MAX webhook registration failed:", response.status, result);
  process.exit(1);
}

console.log("MAX webhook subscription updated successfully.");
console.log("Endpoint:", url);
console.log("Events: bot_started, message_created, message_callback, bot_added, bot_removed");

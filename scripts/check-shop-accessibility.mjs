import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const buttons = [...html.matchAll(/<button\b(?=[^>]*\bclass="[^"]*\bshop-buy\b[^"]*")[^>]*>/gi)];

if (buttons.length !== 13) {
  throw new Error(\`Expected 13 shop purchase buttons, found \${buttons.length}\`);
}

const labels = buttons.map(([tag]) => {
  const match = tag.match(/\baria-label="([^"]+)"/i);
  if (!match) throw new Error(\`Shop purchase button is missing an accessible name: \${tag}\`);
  return match[1].trim();
});

if (labels.some(label => !label)) {
  throw new Error("Shop purchase buttons must have non-empty accessible names");
}

if (new Set(labels).size !== labels.length) {
  throw new Error("Shop purchase button accessible names must be unique");
}

console.log(\`Accessibility OK: \${labels.length} shop purchase buttons have unique accessible names\`);

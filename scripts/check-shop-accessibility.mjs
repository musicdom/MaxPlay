import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const buttons = [...html.matchAll(/<button\b(?=[^>]*\bclass="[^"]*\bshop-buy\b[^"]*")[^>]*>/gi)];

if (buttons.length !== 13) {
  throw new Error("Expected 13 shop purchase buttons, found " + buttons.length);
}

const labels = buttons.map(([tag]) => {
  const match = tag.match(/\baria-label="([^"]+)"/i);
  if (!match) throw new Error("Shop purchase button is missing an accessible name: " + tag);
  return match[1].trim();
});

if (labels.some(label => !label)) {
  throw new Error("Shop purchase buttons must have non-empty accessible names");
}

if (new Set(labels).size !== labels.length) {
  throw new Error("Shop purchase button accessible names must be unique");
}

console.log("Accessibility OK: " + labels.length + " shop purchase buttons have unique accessible names");


const allButtons = [...html.matchAll(/<button\b[^>]*>/gi)];
const buttonsWithoutType = allButtons.filter(([tag]) => !/\btype\s*=\s*["'](?:button|submit|reset)["']/i.test(tag));
if (buttonsWithoutType.length) {
  throw new Error("Every static button must declare an explicit type (button, submit or reset); missing on " + buttonsWithoutType.length + " button(s)");
}

console.log("Button semantics OK: all " + allButtons.length + " static buttons declare an explicit type");

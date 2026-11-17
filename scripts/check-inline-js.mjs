import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(source => source.trim());

if (!scripts.length) {
  throw new Error("No inline JavaScript blocks found in index.html");
}

scripts.forEach((source, index) => {
  new Script(source, { filename: `index.html:inline-script-${index + 1}` });
});

console.log(`Syntax OK: ${scripts.length} inline script block(s) in index.html`);

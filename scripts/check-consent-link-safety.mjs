import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function safeLegalDocumentUrl(");
const endMarker = 'const agreementCheck = document.getElementById("agreementCheck");';
const end = html.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  throw new Error("Consent document link builder was not found");
}

const block = html.slice(start, end);
const checks = [
  ["HTTPS-only URL validation", /url\\.protocol !== "https:"/.test(block)],
  ["Reject URL credentials", /url\\.username \\|\\| url\\.password/.test(block)],
  ["Assign href through the DOM API", /link\\.href = url/.test(block)],
  ["Open links with noopener and noreferrer", /link\\.rel = "noopener noreferrer"/.test(block)],
  ["Build consent content with replaceChildren", /consentBody\\.replaceChildren\\(/.test(block)],
  ["Avoid HTML string injection in the consent block", !/innerHTML\\s*=/.test(block)],
  ["Use textContent for document action labels", /action\\.textContent = "Открыть ↗"/.test(block)]
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "OK" : "FAIL"}: ${name}`);
}
if (failed.length) process.exitCode = 1;
else console.log("Consent document link safety checks passed.");

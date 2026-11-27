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
  ["HTTPS-only URL validation", block.includes('url.protocol !== "https:"')],
  ["Reject URL credentials", block.includes("url.username || url.password")],
  ["Assign href through the DOM API", block.includes("link.href = url")],
  ["Open links with noopener and noreferrer", block.includes('link.rel = "noopener noreferrer"')],
  ["Build consent content with replaceChildren", block.includes("consentBody.replaceChildren(")],
  ["Avoid HTML string injection in the consent block", !block.includes("innerHTML")],
  ["Use textContent for document action labels", block.includes('action.textContent = "Открыть ↗"')]
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "OK" : "FAIL"}: ${name}`);
}
if (failed.length) process.exitCode = 1;
else console.log("Consent document link safety checks passed.");

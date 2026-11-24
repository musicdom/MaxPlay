import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appRule = html.match(/\.app\{[^}]*\}/)?.[0] || "";

if (!/min-height:100vh;\s*min-height:100dvh/.test(appRule)) {
  throw new Error("The app must keep a 100vh fallback and then use 100dvh on modern mobile browsers");
}

const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/i)?.[1] || "";
if (!/viewport-fit=cover/.test(viewport)) {
  throw new Error("The viewport meta tag must preserve safe-area support");
}

console.log("Mobile viewport OK: dynamic viewport height and safe-area viewport configuration are present");

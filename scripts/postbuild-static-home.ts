import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DIST_DIR = resolve(process.cwd(), "dist");
const HOME_HTML_CANDIDATES = [resolve(DIST_DIR, "index.html"), resolve(DIST_DIR, "client/index.html")];
const HOME_SCRIPT_HASHES_PATH = resolve(DIST_DIR, "home-inline-script-hashes.json");
const HOME_CSP_PATH = resolve(DIST_DIR, "home-static-csp.txt");

const STRICT_CSP_BASE = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com https://ssl.google-analytics.com https://www.google.com https://www.google.co.uk https://www.google.se https://www.gstatic.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://stats.g.doubleclick.net https://*.google.com https://*.google.se https://bat.bing.net https://bat.bing.com https://*.bing.com https://s.clarity.ms https://*.clarity.ms",
  "media-src 'self' https: data:",
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://firebaseremoteconfig.googleapis.com https://firebasestorage.googleapis.com https://*.firebaseapp.com https://*.googleapis.com https://*.supabase.co https://www.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://region1.analytics.google.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.merchant-center-analytics.goog https://service.prerender.io https://api.prerender.io https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net https://royal-mail-order.dantun9090.workers.dev https://www.googleadservices.com https://googleads.g.doubleclick.net https://apis.google.com https://bat.bing.net https://bat.bing.com https://*.bing.com https://*.taboola.com https://s.clarity.ms https://*.clarity.ms https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://o4511662760525824.ingest.de.sentry.io https://*.wallid.io https://*.wallid.com",
  "frame-src 'self' blob: https://firebasestorage.googleapis.com https://*.firebaseapp.com https://www.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://www.recaptcha.net https://*.wallid.io https://*.wallid.com https://*.stripe.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/public/csp-report",
  "report-to csp-endpoint",
].join("; ");

function detectBuildId(html: string): string {
  const xBuildId = html.match(/<meta[^>]+name=["']x-build-id["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (xBuildId) return xBuildId;
  return process.env.BUILD_ID || process.env.GITHUB_SHA || "dev";
}

function upsertBuildIdMeta(html: string, buildId: string): string {
  const tag = `<meta name="build-id" content="${buildId}">`;
  if (/<meta[^>]+name=["']build-id["']/i.test(html)) {
    return html.replace(/<meta[^>]+name=["']build-id["'][^>]*>/i, tag);
  }
  return html.replace(/<\/head>/i, `${tag}\n</head>`);
}

function extractInlineScriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const regex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(html)) !== null) {
    const body = match[1]?.trim() ?? "";
    if (body) bodies.push(body);
  }
  return bodies;
}

function hashScript(body: string): string {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}

function buildStaticHomeCsp(scriptHashes: string[]): string {
  const hashList = scriptHashes.join(" ");
  const scriptSrc = `script-src 'self' ${hashList} 'strict-dynamic' 'unsafe-eval'`.trim();
  const scriptSrcElem = `script-src-elem 'self' ${hashList} 'strict-dynamic'`.trim();
  return `${STRICT_CSP_BASE}; ${scriptSrc}; ${scriptSrcElem}`;
}

function verifyNoNonceOnScripts(html: string, filePath: string): void {
  if (/<script\b[^>]*\bnonce\s*=/i.test(html)) {
    throw new Error(`Found nonce attributes on <script> in ${filePath}; home prerender output must be nonce-free.`);
  }
}

function verifyHashesMatchCsp(scriptHashes: string[], csp: string): void {
  const cspHashes = new Set(Array.from(csp.matchAll(/'sha256-[^']+'/g)).map((m) => m[0]));
  for (const hash of scriptHashes) {
    if (!cspHashes.has(hash)) {
      throw new Error(`CSP hash mismatch: missing ${hash} in static home CSP.`);
    }
  }
}

const homeHtmlFiles = HOME_HTML_CANDIDATES.filter((p) => existsSync(p));
if (homeHtmlFiles.length === 0) {
  throw new Error("Missing prerendered home HTML: expected dist/index.html or dist/client/index.html.");
}

let canonicalHashes: string[] | null = null;
let canonicalCsp = "";
for (const filePath of homeHtmlFiles) {
  let html = readFileSync(filePath, "utf8");
  const buildId = detectBuildId(html);
  html = upsertBuildIdMeta(html, buildId);
  verifyNoNonceOnScripts(html, filePath);
  const scriptHashes = extractInlineScriptBodies(html).map(hashScript);
  const csp = buildStaticHomeCsp(scriptHashes);
  verifyHashesMatchCsp(scriptHashes, csp);
  writeFileSync(filePath, html, "utf8");

  if (!canonicalHashes) {
    canonicalHashes = scriptHashes;
    canonicalCsp = csp;
  }
}

if (!canonicalHashes) throw new Error("Failed to compute home inline script hashes.");
mkdirSync(DIST_DIR, { recursive: true });
writeFileSync(
  HOME_SCRIPT_HASHES_PATH,
  `${JSON.stringify({ route: "/", hashes: canonicalHashes }, null, 2)}\n`,
  "utf8",
);
writeFileSync(HOME_CSP_PATH, `${canonicalCsp}\n`, "utf8");

console.log(`[postbuild-static-home] processed: ${homeHtmlFiles.join(", ")}`);
console.log(`[postbuild-static-home] wrote ${HOME_SCRIPT_HASHES_PATH}`);
console.log(`[postbuild-static-home] wrote ${HOME_CSP_PATH}`);

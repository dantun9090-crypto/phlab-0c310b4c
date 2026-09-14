#!/usr/bin/env bun
/**
 * End-to-end MHRA / UK research-compliance audit.
 *
 * Renders every public route, the product pages listed in the sitemap, the
 * product feeds and the customer email templates, and checks each surface
 * against the project's forbidden-claim list. Also verifies the
 * "research use only / not for human consumption" notice is present on
 * every page and reports the age / research gates.
 *
 * Writes:
 *   docs/mhra-compliance-audit.md   — human-readable report
 *   docs/mhra-compliance-audit.json — machine-readable findings
 *
 * Usage:
 *   bun scripts/mhra-audit.ts                       # against local dev server
 *   MHRA_ORIGIN=https://phlabs.co.uk bun scripts/mhra-audit.ts
 *
 * Exit code is always 0 — this is a report, not a gate.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { FORBIDDEN_CLAIMS } from "../src/lib/peptide-compliance";

const ORIGIN = process.env["MHRA_ORIGIN"] ?? "http://localhost:8080";
const UA =
  "Mozilla/5.0 (compatible; PHLabsComplianceAudit/1.0; +https://phlabs.co.uk)";

/** Molecule / brand names that must never appear on Google Ads landing pages. */
const AD_LANDING_BANNED: RegExp[] = [
  /\bRetatrutide\b/i, /\bTirzepatide\b/i, /\bSemaglutide\b/i,
  /\bBPC[-\s]?157\b/i, /\bTB[-\s]?500\b/i, /\bGHK[-\s]?Cu\b/i,
  /\bPT[-\s]?141\b/i, /\bMOTS[-\s]?c\b/i, /\bKPV\b/i,
  /\bMelanotan(?:[-\s]?II)?\b/i, /\bIpamorelin\b/i, /\bCJC[-\s]?1295\b/i,
  /\bHGH\b/i, /\bSomatropin\b/i, /\bIGF[-\s]?1\b/i,
  /\bGLOW\s+Blend\b/i, /\bKLOW\s+Blend\b/i,
];
const AD_LANDING_PATHS = new Set(["/compound", "/landingad", "/landing/phlabs"]);

/** Pages where the research-only notice is not expected (auth/utility pages). */
const NOTICE_EXEMPT = new Set([
  "/login", "/install", "/sentry-test", "/contact",
]);

const RUO_PATTERNS = [
  /research\s+use\s+only/i,
  /laboratory\s+research\s+only/i,
  /not\s+for\s+human\s+consumption/i,
];

type Severity = "fail" | "review" | "pass";
type Finding = {
  surface: string;
  kind: string;
  severity: Severity;
  detail: string;
  excerpt?: string;
  suggestion?: string;
};

const findings: Finding[] = [];
const passes: string[] = [];

function add(f: Finding) { findings.push(f); }

function snippet(text: string, match: string, span = 70): string {
  const i = text.toLowerCase().indexOf(match.toLowerCase());
  if (i < 0) return text.slice(0, 140);
  return (
    (i > span ? "…" : "") +
    text.slice(Math.max(0, i - span), i + match.length + span).replace(/\s+/g, " ") +
    "…"
  );
}

const SUGGESTIONS: Record<string, string> = {
  "Medical claim": "Reframe as an in-vitro / preclinical observation reported in the literature, e.g. \"reported in published research models\".",
  "Health claim": "Remove the outcome wording; describe the compound's research context only.",
  "Disease reference": "Remove the disease name; refer to \"published research models\" instead.",
  "Implies clinical use": "Replace \"clinical\" with \"published study\" or \"laboratory\".",
  "Therapeutic claim": "Remove; state only that the compound is supplied for laboratory research.",
  "Usage instructions": "Delete entirely — no handling, dosing or administration guidance is permitted.",
  "Forbidden — not for human use": "Delete; keep only the \"not for human consumption\" notice.",
  "Quantified efficacy claim": "Remove the percentage/outcome figure or attribute it explicitly to a cited in-vitro study.",
  "Safety claim": "Remove any statement implying the compound is safe.",
  "Implies route of administration": "Remove; no administration language is permitted.",
};

function suggestionFor(reason: string): string {
  for (const key of Object.keys(SUGGESTIONS)) {
    if (reason.toLowerCase().startsWith(key.toLowerCase())) return SUGGESTIONS[key]!;
  }
  return "Reword so the text describes laboratory research context only, with no outcome, health or medical framing.";
}

/** Strip scripts, styles, tags → visible text. */
function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1] ?? "");
  return out;
}

function metaOf(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`, "i");
  return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null;
}

function titleOf(html: string): string | null {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
}

/**
 * Compliant disclaimer wording contains words that are otherwise forbidden
 * ("human consumption", "medicine", "therapeutic"). Remove those exact
 * negated / legal phrases before scanning so the notice does not flag itself.
 */
const NEUTRALISE: RegExp[] = [
  // negated / compliant statements
  /not\s+(intended\s+)?for\s+human\s+(consumption|use|ingestion|application)/gi,
  /\b(not|never|no\s+longer)\s+(approved|authorised|authorized|licensed|intended|suitable|permitted|sold)\s+(by[^.]{0,40}\s+)?for\s+(any\s+)?(human|therapeutic|clinical|diagnostic|medicinal)[^.]{0,90}/gi,
  /\b(are|is)\s+[^?.]{0,80}for\s+human\s+use\s*\?/gi,          // FAQ question wording
  /\bNo\.\s+(All|Neither|None)[^.]{0,120}\./g,                  // FAQ compliant answers
  // scientific / bibliographic context that is not a claim
  /[A-Z][^.]{0,240}?doi:\s*10\.[^\s]+/g,                        // journal citations
  /Drug\s+Affinity\s+Complex/gi,
  /cosmetic[-\s]chemistry/gi,
  /Safe\s+for\s+Google\s+Ads[^.]{0,40}/gi,                      // internal feed metadata
  /not\s+for\s+(consumption|ingestion|injection|diagnostic|therapeutic|medicinal|clinical|veterinary)[^.]{0,60}/gi,
  /for\s+(laboratory\s+)?research\s+use\s+only/gi,
  /for\s+laboratory\s+research\s+only/gi,
  /research\s+use\s+only/gi,
  /not\s+(a|an)\s+(medicine|medicinal\s+product|drug|supplement|cosmetic|food)/gi,
  /no\s+(medical|therapeutic|clinical|health)\s+claims?[^.]{0,60}/gi,
  /human\s+medicines\s+regulations(\s+2012)?/gi,
  /medicines\s+and\s+healthcare\s+products\s+regulatory\s+agency/gi,
  /\bMHRA\b/gi,
  /must\s+not\s+be\s+(used|administered)[^.]{0,60}/gi,
  /never\s+for\s+human[^.]{0,40}/gi,
  /strictly\s+(prohibited|forbidden)[^.]{0,40}/gi,
  /do\s+not\s+(use|administer|ingest|inject)[^.]{0,60}/gi,
];

function neutralise(text: string): string {
  let out = text;
  for (const re of NEUTRALISE) out = out.replace(re, " ");
  return out;
}

/** Run the forbidden-claim list over a text surface. */
function scanText(surface: string, kind: string, raw: string, severity: Severity = "fail") {
  const text = neutralise(raw);
  if (!text.trim()) return;
  const seen = new Set<string>();
  for (const { pattern, reason } of FORBIDDEN_CLAIMS) {
    const m = text.match(pattern);
    if (!m) continue;
    const token = m[0].toLowerCase();
    if (seen.has(token)) continue;
    seen.add(token);
    add({
      surface,
      kind,
      severity,
      detail: `${reason} — "${m[0]}"`,
      excerpt: snippet(text, m[0]),
      suggestion: suggestionFor(reason),
    });
  }
}

/* ── 1. route enumeration ─────────────────────────────────────────── */

function routeFileToPath(file: string): string | null {
  if (!file.endsWith(".tsx") && !file.endsWith(".ts")) return null;
  let name = file.replace(/\.(tsx|ts)$/, "");
  if (name === "__root" || name.startsWith("api") || name.startsWith("[")) return null;
  if (name.includes("$") || name.includes("{")) return null;   // dynamic — covered via sitemap
  if (name.startsWith("_") && !name.includes(".")) return null; // pathless layout
  if (name.startsWith("admin") || name === "login" || name === "sentry-test") return null;
  if (name.includes("[.]")) return null;                        // xml/txt endpoints handled separately
  name = name.replace(/^_marketing\./, "").replace(/^_authenticated\./, "");
  if (name === "index") return "/";
  const path = "/" + name.replace(/\.index$/, "").replace(/\./g, "/");
  return path;
}

async function collectRoutes(): Promise<string[]> {
  const dir = resolve(process.cwd(), "src/routes");
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = new Set<string>();
  for (const e of entries) {
    if (!e.isFile()) continue;
    const p = routeFileToPath(e.name);
    if (p) paths.add(p);
  }
  for (const p of AD_LANDING_PATHS) paths.add(p);
  return [...paths].sort();
}

async function sitemapProductPaths(): Promise<string[]> {
  try {
    const res = await fetch(`${ORIGIN}/sitemap.xml`, { headers: { "user-agent": UA } });
    if (!res.ok) return [];
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    return locs
      .map((u) => { try { return new global.URL(u).pathname; } catch { return ""; } })
      .filter((p) => p.startsWith("/products/") || p.startsWith("/compare/") || p.startsWith("/resources/"))
      .slice(0, 60);
  } catch { return []; }
}

/* ── 2. page audit ────────────────────────────────────────────────── */

async function auditPage(path: string) {
  let html = "";
  let status = 0;
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow",
    });
    status = res.status;
    html = await res.text();
  } catch (err) {
    add({ surface: path, kind: "reachability", severity: "review", detail: `could not fetch: ${(err as Error).message}` });
    return;
  }
  if (status >= 400) {
    add({ surface: path, kind: "reachability", severity: "review", detail: `HTTP ${status}` });
    return;
  }

  const text = visibleText(html);
  scanText(path, "page copy", text, "fail");

  // search snippets
  const title = titleOf(html);
  const desc = metaOf(html, "name", "description");
  if (title) scanText(path, "page title", title);
  else add({ surface: path, kind: "page title", severity: "review", detail: "no <title> found in server HTML" });
  if (desc) scanText(path, "meta description", desc);
  else add({ surface: path, kind: "meta description", severity: "review", detail: "no meta description in server HTML" });

  // structured data
  for (const block of jsonLdBlocks(html)) {
    scanText(path, "structured data", block);
    if (/"@type"\s*:\s*"(Drug|MedicalEntity|Substance)"/i.test(block)) {
      add({ surface: path, kind: "structured data", severity: "fail",
        detail: 'medical schema type used for a research compound',
        suggestion: 'Use "Product" with a non-medical category.' });
    }
  }

  // research-only notice
  if (!NOTICE_EXEMPT.has(path)) {
    const hasNotice = RUO_PATTERNS.some((re) => re.test(text));
    if (!hasNotice) {
      add({ surface: path, kind: "research-only notice", severity: "fail",
        detail: "no research-use-only / not-for-human-consumption notice in the rendered page",
        suggestion: 'Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.' });
    } else passes.push(`${path} — research-only notice present`);
  }

  // ad landing extra restriction
  if (AD_LANDING_PATHS.has(path)) {
    for (const re of AD_LANDING_BANNED) {
      const m = text.match(re);
      if (m) add({ surface: path, kind: "ads landing", severity: "fail",
        detail: `restricted molecule name on an Ads destination — "${m[0]}"`,
        excerpt: snippet(text, m[0]),
        suggestion: "Remove the molecule name from Ads landing copy." });
    }
  }
}

/* ── 3. feeds ─────────────────────────────────────────────────────── */

const FEEDS = [
  "/google-merchant-feed.xml",
  "/google-merchant-feed-free.xml",
  "/google-ads-safe-feed.xml",
  "/bing-feed.xml",
];

async function auditFeeds() {
  for (const f of FEEDS) {
    try {
      const res = await fetch(`${ORIGIN}${f}`, { headers: { "user-agent": UA } });
      if (!res.ok) {
        add({ surface: f, kind: "feed", severity: "review", detail: `HTTP ${res.status}` });
        continue;
      }
      const xml = await res.text();
      scanText(f, "feed content", xml);
      const cats = [...xml.matchAll(/<g:google_product_category>([^<]*)<\/g:google_product_category>/g)].map((m) => m[1]!);
      const bad = cats.filter((c) => /medicine|drug|pharmac/i.test(c));
      if (bad.length) {
        add({ surface: f, kind: "feed category", severity: "fail",
          detail: `medicinal product category used: ${[...new Set(bad)].join(", ")}`,
          suggestion: "Use Health & Beauty > Health Care." });
      } else if (cats.length) {
        passes.push(`${f} — product category is non-medicinal`);
      }
      if (RUO_PATTERNS.some((re) => re.test(xml))) passes.push(`${f} — research-only wording present`);
      else add({ surface: f, kind: "feed", severity: "review",
        detail: "no research-only wording in feed descriptions",
        suggestion: 'Append "For Research Use Only. Not for Human Consumption." to each feed description.' });
    } catch (err) {
      add({ surface: f, kind: "feed", severity: "review", detail: `fetch failed: ${(err as Error).message}` });
    }
  }
}

/* ── 4. email templates ───────────────────────────────────────────── */

async function auditEmails() {
  const dir = resolve(process.cwd(), "src/templates");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".ts"));
  for (const f of files) {
    const src = await readFile(resolve(dir, f), "utf8");
    const surface = `email:${f}`;
    scanText(surface, "email copy", src);
    if (/orderReceived|dispatch|paymentConfirmed|welcome|protocolLibrary|Invoice/i.test(f)) {
      if (RUO_PATTERNS.some((re) => re.test(src))) passes.push(`${surface} — research-only notice present`);
      else add({ surface, kind: "research-only notice", severity: "fail",
        detail: "customer-facing email has no research-only notice",
        suggestion: 'Add "For Research Use Only. Not for Human Consumption." to the email footer.' });
    }
  }
}

/* ── 5. gates & notice persistence ────────────────────────────────── */

async function auditGates() {
  const read = async (p: string) => {
    try { return await readFile(resolve(process.cwd(), p), "utf8"); } catch { return ""; }
  };
  const banner = await read("src/components/DisclaimerBanner.tsx");
  const layout = await read("src/components/Layout.tsx");
  const dob = await read("src/components/DobGateModal.tsx");
  const gate = await read("src/components/ResearchGate.tsx");

  if (/localStorage\.setItem\('disclaimer_dismissed'/.test(banner) || /disclaimer_dismissed/.test(banner)) {
    add({ surface: "site-wide notice", kind: "notice persistence", severity: "fail",
      detail: "the research-only banner can be permanently dismissed and is then never shown again",
      suggestion: "Make the banner non-dismissible, or keep a permanent research-only line in the header/footer that cannot be hidden." });
  }
  if (/For Laboratory Research Only/.test(banner)) {
    add({ surface: "site-wide notice", kind: "notice wording", severity: "review",
      detail: 'banner reads "For Laboratory Research Only — Not for Human Consumption"; the mandated wording is "For Research Use Only. Not for Human Consumption."',
      suggestion: "Use the exact mandated sentence." });
  }
  if (/mhraDisclaimerEnabled\s*!==\s*false/.test(layout)) {
    add({ surface: "footer notice", kind: "notice persistence", severity: "fail",
      detail: "the footer research/MHRA disclaimer can be switched off from a site setting",
      suggestion: "Remove the toggle so the footer notice is always rendered." });
  }
  if (/isContactPage/.test(layout) && /isContactPage[^\n]*DisclaimerBanner|DisclaimerBanner[^\n]*isContactPage/.test(layout)) {
    add({ surface: "/contact", kind: "research-only notice", severity: "review",
      detail: "the research-only banner is suppressed on the contact page",
      suggestion: "Show the notice on every page, including contact." });
  }
  if (/< ?18|age ?< ?18|n < 18/.test(dob)) passes.push("18+ date-of-birth gate present (client)");
  else add({ surface: "age gate", kind: "18+", severity: "review", detail: "no client-side 18+ check found in the DOB gate" });
  if (gate) passes.push("research-use confirmation gate present");

  // server-side 18+ enforcement at order creation
  const orderApi = await read("src/lib/create-order.server.ts");
  const orderApiAlt = orderApi || (await read("src/lib/create-order.functions.ts"));
  if (orderApiAlt) {
    if (/ageConfirm|over18|dob|ageVerified/i.test(orderApiAlt)) passes.push("order creation validates age confirmation server-side");
    else add({ surface: "checkout", kind: "18+ enforcement", severity: "fail",
      detail: "order creation endpoint does not appear to validate the 18+ confirmation",
      suggestion: "Reject orders whose payload lacks a verified 18+ confirmation." });
  } else {
    add({ surface: "checkout", kind: "18+ enforcement", severity: "review",
      detail: "could not locate the order-creation endpoint to verify server-side 18+ enforcement" });
  }
}

/* ── report ───────────────────────────────────────────────────────── */

function md(routes: string[], productPaths: string[]): string {
  const fails = findings.filter((f) => f.severity === "fail");
  const reviews = findings.filter((f) => f.severity === "review");
  const bySurface = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = bySurface.get(f.surface) ?? [];
    arr.push(f); bySurface.set(f.surface, arr);
  }
  const lines: string[] = [];
  lines.push("# MHRA / UK research-compliance audit");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Origin audited: ${ORIGIN}`);
  lines.push(`Surfaces: ${routes.length} routes, ${productPaths.length} product/detail URLs, ${FEEDS.length} feeds, email templates, gates.`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- Must fix: **${fails.length}**`);
  lines.push(`- Needs review: **${reviews.length}**`);
  lines.push(`- Checks passed: **${passes.length}**`);
  lines.push("");
  for (const [surface, list] of [...bySurface.entries()].sort()) {
    lines.push(`## ${surface}`);
    lines.push("");
    for (const f of list) {
      lines.push(`- **${f.severity.toUpperCase()}** (${f.kind}) — ${f.detail}`);
      if (f.excerpt) lines.push(`  - context: \`${f.excerpt.replace(/`/g, "'")}\``);
      if (f.suggestion) lines.push(`  - fix: ${f.suggestion}`);
    }
    lines.push("");
  }
  lines.push("## Passed checks");
  lines.push("");
  for (const p of passes.sort()) lines.push(`- ${p}`);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const routes = await collectRoutes();
  const products = await sitemapProductPaths();
  const all = [...new Set([...routes, ...products])];

  // modest concurrency
  const queue = [...all];
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      const p = queue.shift();
      if (!p) return;
      await auditPage(p);
    }
  });
  await Promise.all(workers);

  await auditFeeds();
  await auditEmails();
  await auditGates();

  await mkdir(resolve(process.cwd(), "docs"), { recursive: true });
  await writeFile(resolve(process.cwd(), "docs/mhra-compliance-audit.md"), md(routes, products), "utf8");
  await writeFile(
    resolve(process.cwd(), "docs/mhra-compliance-audit.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), origin: ORIGIN, routes, products, findings, passes }, null, 2),
    "utf8",
  );

  const fails = findings.filter((f) => f.severity === "fail").length;
  const reviews = findings.filter((f) => f.severity === "review").length;
  console.log(`MHRA audit complete — ${all.length} URLs, ${fails} must-fix, ${reviews} to review, ${passes.length} passed.`);
  console.log("Report: docs/mhra-compliance-audit.md");
}

await main();

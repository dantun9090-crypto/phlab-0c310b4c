#!/usr/bin/env bun
/**
 * CI guard: sprawdza, że wszystkie surface'y SEO używają tej samej
 * kanonicznej domeny zdefiniowanej w src/lib/seo-meta.ts (SITE_URL).
 *
 * Weryfikowane miejsca:
 *   - src/lib/seo-meta.ts         (źródło prawdy: SITE_URL + CANONICAL_HOST)
 *   - src/routes/sitemap[.]xml.ts (BASE_URL musi importować SITE_URL)
 *   - src/lib/sitemap-audit.functions.ts (BASE_URL musi importować SITE_URL)
 *   - src/server.ts               (CANONICAL_HOST musi zgadzać się z seo-meta)
 *   - public/robots.txt           (Sitemap: <SITE_URL>/sitemap.xml)
 *   - src/routes/__root.tsx       (JSON-LD @id / url / Organization / WebSite)
 *
 * Fail = niespójny URL. Skrypt jest komplementarny do
 * scripts/check-domains.ts (który blokuje zabronione domeny w całym repo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

type Failure = { file: string; reason: string };
const failures: Failure[] = [];
const fail = (file: string, reason: string) => failures.push({ file, reason });

// 1) Źródło prawdy: src/lib/seo-meta.ts
const seoMeta = read("src/lib/seo-meta.ts");
const siteUrlMatch = seoMeta.match(/export const SITE_URL\s*=\s*["']([^"']+)["']/);
const canonicalHostMatch = seoMeta.match(/const CANONICAL_HOST\s*=\s*["']([^"']+)["']/);

if (!siteUrlMatch) {
  fail("src/lib/seo-meta.ts", "nie znaleziono `export const SITE_URL = '...'`");
}
if (!canonicalHostMatch) {
  fail("src/lib/seo-meta.ts", "nie znaleziono `const CANONICAL_HOST = '...'`");
}

const SITE_URL = siteUrlMatch?.[1] ?? "";
const CANONICAL_HOST = canonicalHostMatch?.[1] ?? "";

if (SITE_URL && CANONICAL_HOST && !SITE_URL.includes(CANONICAL_HOST)) {
  fail(
    "src/lib/seo-meta.ts",
    `SITE_URL ("${SITE_URL}") nie zawiera CANONICAL_HOST ("${CANONICAL_HOST}")`,
  );
}

if (SITE_URL && !/^https:\/\//.test(SITE_URL)) {
  fail("src/lib/seo-meta.ts", `SITE_URL musi zaczynać się od https:// (jest: ${SITE_URL})`);
}

if (SITE_URL && SITE_URL.endsWith("/")) {
  fail(
    "src/lib/seo-meta.ts",
    `SITE_URL nie powinien kończyć się ukośnikiem (jest: ${SITE_URL})`,
  );
}

// 2) Generator sitemap musi importować SITE_URL, nie hardkodować hosta
const sitemap = read("src/routes/sitemap[.]xml.ts");
if (!/from\s+["']@\/lib\/seo-meta["']/.test(sitemap)) {
  fail(
    "src/routes/sitemap[.]xml.ts",
    "musi importować SITE_URL z '@/lib/seo-meta' (źródło prawdy dla domeny)",
  );
}
if (/const\s+BASE_URL\s*=\s*["']https?:\/\//.test(sitemap)) {
  fail(
    "src/routes/sitemap[.]xml.ts",
    "BASE_URL nie może być hardkodowanym URL-em — użyj `const BASE_URL = SITE_URL;`",
  );
}

// 3) sitemap-audit
const audit = read("src/lib/sitemap-audit.functions.ts");
if (!/from\s+["']@\/lib\/seo-meta["']/.test(audit)) {
  fail(
    "src/lib/sitemap-audit.functions.ts",
    "musi importować SITE_URL z '@/lib/seo-meta'",
  );
}
if (/const\s+BASE_URL\s*=\s*["']https?:\/\//.test(audit)) {
  fail(
    "src/lib/sitemap-audit.functions.ts",
    "BASE_URL nie może być hardkodowanym URL-em",
  );
}

// 4) Worker server.ts CANONICAL_HOST
const server = read("src/server.ts");
const serverHostMatch = server.match(/const CANONICAL_HOST\s*=\s*["']([^"']+)["']/);
if (!serverHostMatch) {
  fail("src/server.ts", "nie znaleziono `const CANONICAL_HOST = '...'`");
} else if (CANONICAL_HOST && serverHostMatch[1] !== CANONICAL_HOST) {
  fail(
    "src/server.ts",
    `CANONICAL_HOST ("${serverHostMatch[1]}") != seo-meta CANONICAL_HOST ("${CANONICAL_HOST}")`,
  );
}

// 5) robots.txt — Sitemap: dyrektywa
const robots = read("public/robots.txt");
const sitemapDirective = robots.match(/^Sitemap:\s*(\S+)/im);
if (!sitemapDirective) {
  fail("public/robots.txt", "brak dyrektywy `Sitemap: ...`");
} else {
  const declared = sitemapDirective[1];
  const expected = `${SITE_URL}/sitemap.xml`;
  if (declared !== expected) {
    fail(
      "public/robots.txt",
      `Sitemap directive ("${declared}") != oczekiwane "${expected}"`,
    );
  }
}

// 6) __root.tsx — JSON-LD musi używać kanonicznego hosta we wszystkich URL-ach
const root = read("src/routes/__root.tsx");
// Szukamy URL-i wewnątrz JSON-LD bloku (organization/website)
const jsonldMatch = root.match(/"@context":\s*"https:\/\/schema\.org"[\s\S]*?\}\),/);
if (!jsonldMatch) {
  fail("src/routes/__root.tsx", "nie znaleziono bloku JSON-LD do walidacji");
} else {
  const block = jsonldMatch[0];
  const urls = [...block.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]);
  for (const u of urls) {
    if (u.startsWith("https://schema.org")) continue;
    if (CANONICAL_HOST && !u.includes(CANONICAL_HOST)) {
      fail("src/routes/__root.tsx", `JSON-LD URL "${u}" nie używa hosta ${CANONICAL_HOST}`);
    }
    // Apex enforcement: nie chcemy www.<host> w canonical/JSON-LD
    if (CANONICAL_HOST && u.includes(`www.${CANONICAL_HOST}`)) {
      fail(
        "src/routes/__root.tsx",
        `JSON-LD używa www.${CANONICAL_HOST} — kanoniczny host to apex (${CANONICAL_HOST})`,
      );
    }
  }
}

// Raport
if (failures.length === 0) {
  console.log(
    `✅ check-url-consistency: wszystkie surface'y używają ${SITE_URL} (host: ${CANONICAL_HOST}).`,
  );
  process.exit(0);
}

console.error(`❌ check-url-consistency: znaleziono ${failures.length} niespójności.\n`);
console.error(
  `Źródło prawdy: src/lib/seo-meta.ts → SITE_URL="${SITE_URL}", CANONICAL_HOST="${CANONICAL_HOST}"\n`,
);
for (const f of failures) {
  console.error(`  • ${f.file}`);
  console.error(`      ${f.reason}`);
}
process.exit(1);

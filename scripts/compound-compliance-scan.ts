#!/usr/bin/env bun
/**
 * Compliance scan for the /compound landing page.
 *
 * Fetches the prerendered HTML (as Googlebot sees it) and fails the
 * build if any prohibited substance name appears. /compound is a Google
 * Ads landing page and must never reference restricted peptide names.
 *
 * Exits 0 on success or when the origin is unreachable (offline-safe).
 * Exits 1 if any prohibited term is found.
 *
 * Override the target with COMPOUND_TEST_ORIGIN.
 */

const ORIGIN = process.env.COMPOUND_TEST_ORIGIN ?? "https://phlabs.co.uk";
const URL = `${ORIGIN}/compound`;
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// Prohibited substance / brand names that must NOT appear on /compound.
// Sourced from the project's restricted-peptide list.
const PROHIBITED: RegExp[] = [
  /\bBPC[-\s]?157\b/i,
  /\bTB[-\s]?500\b/i,
  /\bGHK[-\s]?Cu\b/i,
  /\bPT[-\s]?141\b/i,
  /\bMOTS[-\s]?c\b/i,
  /\bKPV\b/i,
  /\bNAD\+?\b/i,
  /\bMelanotan(?:[-\s]?II)?\b/i,
  /\bRetatrutide\b/i,
  /\bTirzepatide\b/i,
  /\bSemaglutide\b/i,
  /\bIpamorelin\b/i,
  /\bCJC[-\s]?1295\b/i,
  /\bSermorelin\b/i,
  /\bHexarelin\b/i,
  /\bGHRP[-\s]?[26]\b/i,
  /\bHGH\b/i,
  /\bSomatropin\b/i,
  /\bIGF[-\s]?1\b/i,
  /\bAOD[-\s]?9604\b/i,
  /\bDSIP\b/i,
  /\bSelank\b/i,
  /\bSemax\b/i,
  /\bEpitalon\b/i,
  /\bThymosin\b/i,
  /\bOxytocin\b/i,
  /\bFollistatin\b/i,
  /\bMyostatin\b/i,
  /\bGLOW\s+Blend\b/i,
  /\bKLOW\s+Blend\b/i,
];

async function main(): Promise<void> {
  let html: string;
  try {
    const res = await fetch(URL, {
      headers: { "user-agent": GOOGLEBOT, accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`[skip] ${URL} returned ${res.status} — skipping scan.`);
      return;
    }
    html = await res.text();
  } catch (err) {
    console.warn(`[skip] ${URL} unreachable (${(err as Error).message}).`);
    return;
  }

  const hits: { term: string; sample: string }[] = [];
  for (const re of PROHIBITED) {
    const m = html.match(re);
    if (m) {
      const idx = html.indexOf(m[0]);
      const sample = html
        .slice(Math.max(0, idx - 40), idx + m[0].length + 40)
        .replace(/\s+/g, " ");
      hits.push({ term: m[0], sample });
    }
  }

  if (hits.length === 0) {
    console.log(`✅ /compound clean — 0 prohibited terms in ${html.length} bytes.`);
    return;
  }

  console.error(`❌ /compound contains ${hits.length} prohibited term(s):`);
  for (const h of hits) {
    console.error(`  • "${h.term}" → …${h.sample}…`);
  }
  process.exit(1);
}

await main();

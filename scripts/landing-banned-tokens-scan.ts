#!/usr/bin/env bun
/**
 * Build-time guard: fail if Google-Ads-restricted molecule names appear in
 * the /compound or /landing/phlabs landing page source. These pages are
 * Google Ads destinations and must stay free of pharma classifier triggers.
 *
 * Scans:
 *   - src/components/PremiumLanding.tsx          (/compound body)
 *   - src/components/EditorialLanding.tsx        (/landing/phlabs body)
 *   - src/components/LandingPromoStrip.tsx       (shared promo strip)
 *   - src/routes/_marketing.compound.tsx         (/compound head)
 *   - src/routes/landing.phlabs.tsx              (/landing/phlabs head)
 *
 * Exits 0 clean / 1 on any hit.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const FILES = [
  "src/components/PremiumLanding.tsx",
  "src/components/EditorialLanding.tsx",
  "src/components/LandingPromoStrip.tsx",
  "src/routes/_marketing.compound.tsx",
  "src/routes/landing.phlabs.tsx",
];

// Bacteriostatic Water is intentionally allowed (laboratory reagent, not a peptide).
const BANNED: RegExp[] = [
  /\bRetatrutide\b/i,
  /\bTirzepatide\b/i,
  /\bSemaglutide\b/i,
  /\bBPC[-\s]?157\b/i,
  /\bTB[-\s]?500\b/i,
  /\bGHK[-\s]?Cu\b/i,
  /\bPT[-\s]?141\b/i,
  /\bMOTS[-\s]?c\b/i,
  /\bKPV\b/i,
  /\bMelanotan(?:[-\s]?II)?\b/i,
  /\bIpamorelin\b/i,
  /\bCJC[-\s]?1295\b/i,
  /\bHGH\b/i, /\bSomatropin\b/i, /\bIGF[-\s]?1\b/i,
  /\bGLOW\s+Blend\b/i, /\bKLOW\s+Blend\b/i,
  // Forbidden medical/Ads-policy verbs
  /\bweight[-\s]?loss\b/i, /\bcures?\b/i, /\btreats?\b/i,
  /\bdosage\b/i, /\binjectable\b/i,
];

let failed = 0;
for (const rel of FILES) {
  const abs = resolve(process.cwd(), rel);
  let src: string;
  try {
    src = await readFile(abs, "utf8");
  } catch (err) {
    console.warn(`[skip] ${rel} (${(err as Error).message})`);
    continue;
  }
  for (const re of BANNED) {
    const m = src.match(re);
    if (m) {
      const idx = src.indexOf(m[0]);
      const ctx = src.slice(Math.max(0, idx - 50), idx + m[0].length + 50)
        .replace(/\s+/g, " ");
      console.error(`❌ ${rel} — "${m[0]}" → …${ctx}…`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`\nFAIL: ${failed} banned token(s) in Ads landing source.`);
  process.exit(1);
}
console.log(`✅ Ads landings clean (${FILES.length} files scanned).`);

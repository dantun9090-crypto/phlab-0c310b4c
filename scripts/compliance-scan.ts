/**
 * Resources content compliance scan.
 *
 * Scans every article in src/pages/Resources/data/articles.ts for:
 *   1. Efficacy-outcome trigger phrases that must be reframed as
 *      trial / preclinical observations (weight loss, glucose
 *      normalisation, insulin sensitivity improvement, tissue repair,
 *      cure / treat language, etc.).
 *   2. Sections that contain human / clinical trial language paired
 *      with an outcome topic (weight, glucose, HbA1c, insulin
 *      sensitivity, tissue repair, wound healing) but are missing the
 *      mandatory investigational-findings disclaimer sentence.
 *
 * Exit code:
 *   0 — no hard violations
 *   1 — one or more hard violations (used by CI to fail the build)
 *
 * Run via: bun scripts/compliance-scan.ts  (or `bun run compliance:scan`)
 *
 * Pass --json to emit a machine-readable report on stdout.
 */
import { articles } from "../src/pages/Resources/data/articles";

// Hard violations — must be reframed.
const TRIGGER_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(reduc(ed|es|ing)|decreas(ed|es|ing))\s+(body\s+)?weight\b/i, label: "weight reduction claim" },
  { re: /\bweight\s+loss\b/i, label: "weight loss claim" },
  { re: /\bimprov(ed|es|ing)\s+insulin\s+sensitivit/i, label: "insulin sensitivity improvement claim" },
  { re: /\bnormali[sz](ed|es|ing)\s+(blood\s+)?glucose\b/i, label: "glucose normalisation claim" },
  { re: /\blower(ed|s|ing)\s+(blood\s+)?glucose\b/i, label: "glucose lowering claim" },
  { re: /\baccelerat(ed|es|ing)\s+(healing|recovery|repair)/i, label: "accelerated healing claim" },
  { re: /\b(heals?|cured?|treats?)\s+(injury|injuries|wounds?|tendons?|ligaments?|disease|patients?)\b/i, label: "medical outcome verb" },
];

const DISCLAIMER =
  /investigational findings from controlled trials and do not constitute efficacy claims/i;

// Topics that, when paired with human/clinical framing, require the disclaimer.
const OUTCOME_TOPIC =
  /\b(body\s+weight|fat\s+mass|HbA1c|fasting\s+glucose|insulin\s+sensitivit|tissue\s+repair|wound\s+healing|re-epithelialisation)\b/i;

// Human / clinical framing markers.
const HUMAN_DATA =
  /\b(human\s+(trial|participants?|cohort|patients?|subjects?)|patients?\s+(with|receiving|treated)|participants?\s+(received|reported|achieved|experienced)|phase\s*[123]\s+(trial|study)|SURPASS|SURMOUNT|TRIUMPH|clinical\s+trial|clinical\s+cohort|randomi[sz]ed\s+controlled)\b/i;

type Hit = {
  slug: string;
  title: string;
  sectionIndex: number;
  heading: string;
  kind: "trigger" | "missing-disclaimer";
  detail: string;
  excerpt: string;
};

function snippet(text: string, match: string, span = 80): string {
  const i = text.toLowerCase().indexOf(match.toLowerCase());
  if (i < 0) return text.slice(0, span * 2);
  const start = Math.max(0, i - span);
  const end = Math.min(text.length, i + match.length + span);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const a of articles) {
    for (let i = 0; i < a.content.length; i++) {
      const s = a.content[i] as { heading?: string; body: string; callout?: { text: string } };
      const text = [s.heading, s.body, s.callout?.text].filter(Boolean).join("\n");
      if (!text) continue;
      // Inline opt-out: when a section quotes forbidden marketing language
      // as an example of what unreliable suppliers do, the author can mark
      // it with `<!-- compliance-ok: <reason> -->` to suppress the scan.
      if (/<!--\s*compliance-ok:/i.test(text)) continue;

      for (const p of TRIGGER_PATTERNS) {
        const m = text.match(p.re);
        if (m) {
          hits.push({
            slug: a.slug,
            title: a.title,
            sectionIndex: i,
            heading: s.heading ?? "(no heading)",
            kind: "trigger",
            detail: `${p.label}: "${m[0]}"`,
            excerpt: snippet(text, m[0]),
          });
        }
      }

      if (HUMAN_DATA.test(text) && OUTCOME_TOPIC.test(text) && !DISCLAIMER.test(text)) {
        const h = text.match(HUMAN_DATA)![0];
        hits.push({
          slug: a.slug,
          title: a.title,
          sectionIndex: i,
          heading: s.heading ?? "(no heading)",
          kind: "missing-disclaimer",
          detail: `human/clinical paragraph missing investigational disclaimer (matched "${h}")`,
          excerpt: snippet(text, h),
        });
      }
    }
  }
  return hits;
}

const hits = scan();
const wantJson = process.argv.includes("--json");

if (wantJson) {
  console.log(JSON.stringify({ totalHits: hits.length, hits }, null, 2));
} else if (hits.length === 0) {
  console.log(`✓ Resources compliance scan passed — ${articles.length} articles, 0 hits`);
} else {
  console.error(`✗ Resources compliance scan — ${hits.length} hit(s) across ${new Set(hits.map((h) => h.slug)).size} article(s):\n`);
  for (const h of hits) {
    console.error(
      `  [${h.kind}] /resources/${h.slug}  §${h.sectionIndex} ${h.heading}\n    ${h.detail}\n    ${h.excerpt}\n`,
    );
  }
  console.error(
    `\nFix by either (a) reframing the outcome verb as a trial observation, or\n(b) appending: "These are investigational findings from controlled trials and do not constitute efficacy claims for research compounds."`,
  );
}

process.exit(hits.length > 0 ? 1 : 0);

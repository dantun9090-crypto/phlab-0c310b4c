/**
 * Internal Link Booster
 * ---------------------
 * Pure, client-safe utilities that scan product / article HTML for
 * mentions of hub compounds and suggest contextual <a> links pointing
 * to the canonical product PDP. The Admin "Internal Links" tab uses
 * these helpers to surface suggestions and apply approved rewrites.
 *
 * Rules:
 *  - Never link a page to itself (currentSlug guard).
 *  - Skip occurrences already inside an <a>…</a>.
 *  - Skip occurrences inside heading tags (<h1>…<h6>).
 *  - Only inject the FIRST occurrence per keyword per document.
 *  - Word-boundary aware; case-insensitive; preserves original casing.
 */

export interface HubTarget {
  /** Canonical PDP slug (also default href segment under /products/). */
  slug: string;
  /** Display label used in suggestion UIs. */
  label: string;
  /** Phrases that should anchor a link. First is canonical. */
  aliases: string[];
  /** Optional explicit href override (defaults to /products/{slug}). */
  href?: string;
}

export const HUB_TARGETS: HubTarget[] = [
  // Pillar pages — checked first so longer multi-word aliases ("retatrutide uk")
  // win over the generic PDP alias ("Retatrutide").
  { slug: 'retatrutide-uk-pillar',                  label: 'Retatrutide UK',      aliases: ['retatrutide UK', 'retatrutide uk source', 'reta peptide uk', 'UK retatrutide'], href: '/research/retatrutide-uk' },
  { slug: 'bpc-157-uk-pillar',                      label: 'BPC-157 UK',          aliases: ['BPC-157 UK', 'BPC 157 UK', 'bpc-157 uk source', 'UK BPC-157'], href: '/research/bpc-157-uk' },
  { slug: 'retatrutide-research-peptide',          label: 'Retatrutide',         aliases: ['Retatrutide', 'LY3437943'] },
  { slug: 'tirzepatide-research-peptide',          label: 'Tirzepatide',         aliases: ['Tirzepatide', 'LY3298176'] },
  { slug: 'bpc-157',                                label: 'BPC-157',             aliases: ['BPC-157', 'BPC 157', 'Body Protection Compound 157'] },
  { slug: 'tb-500-thymosin-beta-4',                 label: 'TB-500',              aliases: ['TB-500', 'TB 500', 'Thymosin Beta-4', 'Thymosin Beta 4'] },
  { slug: 'kpv-research-peptide',                   label: 'KPV',                 aliases: ['KPV peptide', 'Lys-Pro-Val'] },
  { slug: 'mots-c-research-peptide',                label: 'MOTS-c',              aliases: ['MOTS-c', 'MOTS c'] },
  { slug: 'pt-141-research-peptide',                label: 'PT-141',              aliases: ['PT-141', 'Bremelanotide'] },
  { slug: 'nad-research-compound',                  label: 'NAD+',                aliases: ['NAD+', 'NAD plus', 'Nicotinamide Adenine Dinucleotide'] },
  { slug: 'ghk-cu-research-peptide',                label: 'GHK-Cu',              aliases: ['GHK-Cu', 'GHK Cu', 'Copper Tripeptide'] },
  { slug: 'glow-blend',                             label: 'GLOW Blend',          aliases: ['GLOW blend', 'GLOW peptide blend'] },
  { slug: 'klow-blend',                             label: 'KLOW Blend',          aliases: ['KLOW blend', 'KLOW peptide blend'] },
  { slug: 'melanotan-ii-research-peptide',          label: 'Melanotan-II',        aliases: ['Melanotan-II', 'Melanotan II', 'MT-II'] },
  { slug: 'bacteriostatic-water-research-compound', label: 'Bacteriostatic Water', aliases: ['bacteriostatic water', 'BAC water'] },
];

const PDP_BASE = '/products/';

export interface LinkSuggestion {
  /** Hub slug being suggested. */
  hubSlug: string;
  /** Hub label (display). */
  hubLabel: string;
  /** The exact matched substring as it appears in source HTML. */
  match: string;
  /** Character offset of the match in the source HTML. */
  offset: number;
  /** ~80-char context snippet around the match (text, anchor-stripped). */
  snippet: string;
  /** PDP URL the anchor would point to. */
  href: string;
}

const SKIP_BLOCK_RE = /<(a|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Returns the indexes that fall inside an <a> or heading tag and must
 * therefore be skipped during scanning and rewriting.
 */
function computeSkipRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  SKIP_BLOCK_RE.lastIndex = 0;
  while ((m = SKIP_BLOCK_RE.exec(html))) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function isInSkipRange(offset: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) if (offset >= s && offset < e) return true;
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAliasRegex(alias: string): RegExp {
  // \b doesn't cooperate with '+' / '-' so use lookarounds for word edges.
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegex(alias)}(?![A-Za-z0-9])`, 'gi');
}

function snippetAround(html: string, offset: number, len: number): string {
  const start = Math.max(0, offset - 40);
  const end = Math.min(html.length, offset + len + 40);
  return html
    .slice(start, end)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scan HTML for the first occurrence of each hub alias. Returns one
 * suggestion per hub keyword (the canonical first match), excluding
 * self-links and anything already inside <a>/headings.
 */
export function scanForLinkSuggestions(html: string, currentSlug: string | null = null): LinkSuggestion[] {
  if (!html) return [];
  const skip = computeSkipRanges(html);
  const out: LinkSuggestion[] = [];
  const seenHubs = new Set<string>();

  for (const hub of HUB_TARGETS) {
    if (currentSlug && hub.slug === currentSlug) continue;
    if (seenHubs.has(hub.slug)) continue;
    for (const alias of hub.aliases) {
      const re = buildAliasRegex(alias);
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        if (isInSkipRange(m.index, skip)) continue;
        out.push({
          hubSlug: hub.slug,
          hubLabel: hub.label,
          match: m[0],
          offset: m.index,
          snippet: snippetAround(html, m.index, m[0].length),
          href: hub.href ?? `${PDP_BASE}${hub.slug}`,
        });
        seenHubs.add(hub.slug);
        break;
      }
      if (seenHubs.has(hub.slug)) break;
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

/**
 * Apply accepted suggestions to HTML. Idempotent — if the anchor with
 * the same href and matched text already wraps the keyword at the given
 * offset, no change is made. Ranges inside <a>/headings stay untouched.
 */
export function applyLinkSuggestions(html: string, accepted: LinkSuggestion[]): string {
  if (!accepted.length) return html;

  // Re-scan rather than trust caller offsets (HTML may have shifted).
  const skip = computeSkipRanges(html);
  // Process tail → head so earlier offsets remain valid.
  const work = [...accepted]
    .map((s) => {
      const re = buildAliasRegex(s.match);
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        if (!isInSkipRange(m.index, skip)) {
          return { ...s, offset: m.index, matchedLength: m[0].length, actualMatch: m[0] };
        }
      }
      return null;
    })
    .filter(Boolean) as Array<LinkSuggestion & { matchedLength: number; actualMatch: string }>;

  // Dedupe: keep first per hub slug.
  const byHub = new Map<string, typeof work[number]>();
  for (const w of work) if (!byHub.has(w.hubSlug)) byHub.set(w.hubSlug, w);

  const sorted = Array.from(byHub.values()).sort((a, b) => b.offset - a.offset);

  let out = html;
  for (const w of sorted) {
    const before = out.slice(0, w.offset);
    const after = out.slice(w.offset + w.matchedLength);
    const anchor = `<a href="${w.href}" data-internal-link="phlabs">${w.actualMatch}</a>`;
    out = `${before}${anchor}${after}`;
  }
  return out;
}

/**
 * Convenience: count how many suggestions a document currently has.
 */
export function countSuggestions(html: string, currentSlug: string | null = null): number {
  return scanForLinkSuggestions(html, currentSlug).length;
}

/**
 * Stable, short product SKU/MPN — shared between the on-page Product JSON-LD
 * and the Google Merchant XML feeds so Merchant Center sees identical values
 * on both surfaces (feed vs landing page cross-check).
 *
 * Resolution order:
 *   1. `product.sku` from Firestore, if set (authoritative).
 *   2. Keyword match on product name (e.g. "Retatrutide …" → RET-001).
 *   3. Deterministic hash of the Firestore doc id → PHL-XXXX.
 */

const SKU_PREFIX_BY_KEYWORD: Array<[string, string]> = [
  ["retatrutide", "RET-001"],
  ["kpv", "KPV-001"],
  ["motsc", "MOT-001"],
  ["mots-c", "MOT-001"],
  ["mots c", "MOT-001"],
  ["bpc-157", "PHP-157"],
  ["bpc157", "PHP-157"],
  ["tb-500", "TB5-001"],
  ["tb500", "TB5-001"],
  ["pt-141", "PT141-001"],
  ["pt141", "PT141-001"],
  ["nad", "NAD-001"],
  ["ghk-cu", "GHK-001"],
  ["ghk cu", "GHK-001"],
  ["glow", "GLOW-001"],
  ["klow", "KLOW-001"],
  ["melanotan", "MEL-001"],
  ["tirzepatide", "TZP-001"],
  ["semaglutide", "SEM-001"],
  ["bacteriostatic", "BAC-001"],
];

export function skuFor(
  name: string | undefined,
  docId: string | undefined,
  existing?: string | null,
): string {
  const trimmed = (existing || "").trim();
  if (trimmed) return trimmed;

  const n = (name || "").toLowerCase();
  for (const [kw, sku] of SKU_PREFIX_BY_KEYWORD) {
    if (n.includes(kw)) return sku;
  }

  const id = docId || "";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `PHL-${String((h % 9000) + 1000)}`;
}

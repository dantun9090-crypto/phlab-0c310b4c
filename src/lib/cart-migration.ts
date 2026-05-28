/**
 * Client-side cart migration.
 *
 * Legacy carts (pre-variantId refactor) stored items in `localStorage.php_cart`
 * with `id` set to the concatenated cart key — `"<productId>-<variantId>"` —
 * and no separate `variantId` field. The current code stores them split:
 * `id` = canonical productId, `variantId` = variant id.
 *
 * This module rewrites legacy shapes in place so:
 *   1. server-side `validateCartPrices` doesn't need the legacy fallback,
 *   2. the UI shows the correct variant price/name,
 *   3. duplicate lines (same product+variant stored under both shapes) collapse.
 *
 * It is intentionally conservative: we only split when the suffix matches a
 * peptide variant pattern (e.g. `5mg`, `10mg`, `2.5mg`, `100mcg`). Product
 * slugs that happen to contain `-` (e.g. `mt-2`, `bpc-157`) are left alone.
 */

export interface MigratableCartItem {
  id: string;
  variantId?: string;
  quantity?: number;
  [k: string]: unknown;
}

// Variant suffix: <number>[.<number>] <unit> at the end of the id.
// Units cover everything used in product_stock: mg, mcg, ug, iu, ml, g, kg.
const VARIANT_SUFFIX = /-(\d+(?:\.\d+)?(?:mg|mcg|ug|iu|ml|g|kg))$/i;

interface SplitResult {
  productId: string;
  variantId: string;
}

/**
 * If `id` looks like `<productId>-<variantSuffix>`, return the split.
 * Returns null when the id has no recognizable variant suffix.
 */
export function splitLegacyCartId(id: string): SplitResult | null {
  const m = VARIANT_SUFFIX.exec(id);
  if (!m) return null;
  const variantId = m[1].toLowerCase();
  const productId = id.slice(0, id.length - m[0].length);
  if (!productId) return null;
  return { productId, variantId };
}

/**
 * Pure migration: takes the raw parsed cart array and returns a normalized
 * one. Idempotent — running twice is a no-op. Safe to call with malformed
 * input (returns []).
 */
export function migrateCartItems<T extends MigratableCartItem>(items: unknown): T[] {
  if (!Array.isArray(items)) return [];

  const normalized: T[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = { ...(raw as T) };
    if (typeof item.id !== 'string' || !item.id) continue;

    // Case A: no variantId set, but id encodes one. Split.
    if (!item.variantId) {
      const split = splitLegacyCartId(item.id);
      if (split) {
        item.id = split.productId;
        item.variantId = split.variantId;
      }
    } else if (item.id.toLowerCase().endsWith(`-${item.variantId.toLowerCase()}`)) {
      // Case B: variantId already set, but id still has the suffix appended.
      // Strip it so id is the canonical productId.
      const stripped = item.id.slice(0, item.id.length - item.variantId.length - 1);
      if (stripped) item.id = stripped;
    }

    normalized.push(item);
  }

  // Collapse duplicates that arise after splitting (same productId+variantId).
  const byKey = new Map<string, T>();
  for (const item of normalized) {
    const key = item.variantId ? `${item.id}::${item.variantId}` : item.id;
    const existing = byKey.get(key);
    if (existing) {
      const a = typeof existing.quantity === 'number' ? existing.quantity : 0;
      const b = typeof item.quantity === 'number' ? item.quantity : 0;
      existing.quantity = a + b || 1;
    } else {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Read `localStorage.php_cart`, migrate it, and write back if anything
 * changed. Returns the migrated array (or null when there is no cart /
 * we're not in a browser).
 */
export function migrateStoredCart<T extends MigratableCartItem>(
  storageKey = 'php_cart',
): T[] | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const migrated = migrateCartItems<T>(parsed);
  const serialized = JSON.stringify(migrated);
  if (serialized !== raw) {
    try {
      window.localStorage.setItem(storageKey, serialized);
    } catch {
      /* ignore quota errors — in-memory state still gets the migrated list */
    }
  }
  return migrated;
}

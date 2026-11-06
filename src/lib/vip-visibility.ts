/**
 * VIP-exclusive product visibility.
 *
 * A product flagged `isVip: true` in Admin → Products is meant to exist ONLY
 * inside the members store at /vip. The server-side surfaces (sitemap, SSR
 * crawler catalogue, merchant feed — see `firestore-rest.ts`) already strip
 * them, but the client-side catalogue, category pages, search, nav and
 * home grid used to render them to everyone, which defeated the whole flag.
 *
 * Use `excludeVipProducts()` on every PUBLIC listing. The /vip store keeps
 * using the raw list and filters the other way round.
 */

/** True when the product is marked VIP-exclusive. */
export const isVipProduct = (p: unknown): boolean =>
  (p as { isVip?: unknown } | null)?.isVip === true;

/** Public listings: drop VIP-exclusive products. */
export const excludeVipProducts = <T,>(products: T[]): T[] =>
  products.filter((p) => (p as { isVip?: unknown }).isVip !== true);

/** /vip store: keep only VIP-exclusive products. */
export const onlyVipProducts = <T,>(products: T[]): T[] =>
  products.filter((p) => (p as { isVip?: unknown }).isVip === true);

/**
 * Legacy-host awareness for prohealthpeptides.co.uk. check-domains-allow-line
 *
 * prohealthpeptides.co.uk is an intentional SEO/GMC-only mirror of the store check-domains-allow-line
 * (see cloudflare/prohealth-legacy-proxy.js). Its Worker 302s every
 * transactional path (/login, /register, /account, /cart, /checkout, /payment,
 * /orders, /admin, /api) to phlabs.co.uk, because Firebase Auth state, session
 * cookies, CSP nonces and Wallid return URLs must all live on ONE origin.
 *
 * Google sign-in therefore cannot complete on the legacy host — the user gets
 * silently bounced mid-flow, which looks broken. These helpers make the hop
 * explicit instead: on the legacy host, account/cart CTAs point directly at
 * absolute https://phlabs.co.uk/... URLs and the UI says so up front.
 */

export const MAIN_ORIGIN = 'https://phlabs.co.uk';
export const MAIN_HOST = 'phlabs.co.uk';

const LEGACY_HOSTS = ['prohealthpeptides.co.uk'];  // check-domains-allow-line

const stripWww = (h: string): string => (h || '').toLowerCase().replace(/^www\./, '').split(':')[0];

/** True when the page is being served from a legacy SEO mirror host. */
export function isLegacyHost(hostname?: string): boolean {
  const host = stripWww(
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : ''),
  );
  if (!host) return false;
  return LEGACY_HOSTS.includes(host);
}

/**
 * Resolve a transactional path for the current host.
 * Legacy host → absolute phlabs.co.uk URL. Canonical host → plain path.
 */
export function transactionalHref(path: string, hostname?: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return isLegacyHost(hostname) ? `${MAIN_ORIGIN}${p}` : p;
}

/** Copy shown next to account/checkout CTAs on the legacy host. */
export const LEGACY_TRANSACTION_NOTICE = `Accounts, sign-in and checkout are handled on ${MAIN_HOST}.`;

/**
 * Cross-origin cart handoff. localStorage is per-origin, so a shopper who
 * adds items on the legacy mirror and then hops to the canonical checkout
 * would otherwise arrive with an EMPTY cart ("Your cart is empty"
 * complaint). We serialize the cart into the URL; /checkout imports it on
 * load (and scrubs the param). Prices are re-validated server-side at
 * preflight, so URL-tampering cannot change what gets charged.
 */
export interface CartTransferItem {
  id: string;
  variantId?: string;
  variantName?: string;
  name?: string;
  dosage?: string;
  price?: string;
  priceNum?: number;
  quantity?: number;
  image?: string;
  slug?: string;
}

export function buildTransactionalHrefWithCart(
  path: string,
  items: CartTransferItem[],
  hostname?: string,
): string {
  const base = transactionalHref(path, hostname);
  if (!isLegacyHost(hostname) || items.length === 0) return base;
  const payload = items.map((i) => ({
    id: String(i.id ?? ''),
    variantId: i.variantId ? String(i.variantId) : undefined,
    variantName: i.variantName ? String(i.variantName).slice(0, 80) : undefined,
    name: i.name ? String(i.name).slice(0, 120) : undefined,
    dosage: i.dosage ? String(i.dosage).slice(0, 40) : undefined,
    price: i.price ? String(i.price).slice(0, 16) : undefined,
    priceNum: typeof i.priceNum === 'number' ? i.priceNum : undefined,
    quantity: typeof i.quantity === 'number' ? Math.max(1, Math.min(99, i.quantity)) : 1,
    image: i.image ? String(i.image).slice(0, 300) : undefined,
    slug: i.slug ? String(i.slug).slice(0, 120) : undefined,
  })).filter((i) => i.id);
  if (payload.length === 0) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}cart=${encodeURIComponent(JSON.stringify(payload))}`;
}

/** Parse the `?cart=` transfer payload. Returns null when absent/invalid. */
export function parseCartTransferParam(search: string): CartTransferItem[] | null {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get('cart');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const items = parsed
      .filter((i) => i && typeof i === 'object' && typeof i.id === 'string' && i.id)
      .map((i) => ({
        ...i,
        quantity: typeof i.quantity === 'number' && i.quantity > 0 ? Math.min(99, i.quantity) : 1,
      }));
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

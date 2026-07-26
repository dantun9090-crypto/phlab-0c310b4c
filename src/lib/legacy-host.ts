/**
 * Legacy-host awareness for prohealthpeptides.co.uk.
 *
 * prohealthpeptides.co.uk is an intentional SEO/GMC-only mirror of the store
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

const LEGACY_HOSTS = ['prohealthpeptides.co.uk'];

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

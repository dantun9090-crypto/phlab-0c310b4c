/**
 * Canonical "do not cache anywhere" header set for payment/webhook/order
 * status endpoints. Spread into every Response.
 *
 *   - `Cache-Control` covers browser + intermediate caches.
 *   - `CDN-Cache-Control` + `Cloudflare-CDN-Cache-Control` + `Surrogate-Control`
 *     defeat CDN/edge caches that ignore `Cache-Control: no-store`.
 *   - `Pragma`/`Expires` cover ancient HTTP/1.0 proxies.
 *   - `Vary: *` forces revalidation regardless of request headers.
 */
export const NO_STORE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
  "cdn-cache-control": "no-store",
  "cloudflare-cdn-cache-control": "no-store",
  "surrogate-control": "no-store",
  pragma: "no-cache",
  expires: "0",
  vary: "*",
} as const;

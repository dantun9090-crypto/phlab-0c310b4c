/**
 * Whitelist check for cart/product-provided image URLs before they land in
 * <img src>. Allows same-origin relative paths, absolute http(s) URLs and
 * inline data:image/* payloads. Anything else (javascript:, vbscript:,
 * protocol-relative oddities) returns null so callers render the fallback
 * placeholder instead.
 *
 * Closes CodeQL js/xss + js/client-side-unvalidated-url-redirection on cart
 * image rendering (Checkout order summary, Layout cart drawer).
 */
export function safeImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  if (/^data:image\//i.test(u)) return u;
  try {
    const p = new URL(u);
    if (p.protocol === 'https:' || p.protocol === 'http:') return u;
  } catch {
    /* not an absolute URL */
  }
  return null;
}

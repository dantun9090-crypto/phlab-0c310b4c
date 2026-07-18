/**
 * Validate an image URL before assigning it to `<img src>` in admin flows.
 * Blocks `javascript:` / `vbscript:` / other exotic schemes that CodeQL flags
 * under `js/xss-through-dom`. Allows `http`, `https`, `data:image/*`, and
 * `blob:` (used by File-API previews).
 *
 * Returns the trimmed URL when safe, or an empty string otherwise. Never
 * throws — callers can substitute a placeholder when the return is empty.
 */
export function safeImageUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const url = input.trim();
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url; // same-origin relative
  if (/^blob:/i.test(url)) return url;
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);/i.test(url)) return url;
  try {
    const parsed = new URL(url, 'https://phlabs.co.uk');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {
    /* fall through */
  }
  return '';
}

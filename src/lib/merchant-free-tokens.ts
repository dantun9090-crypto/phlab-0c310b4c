/**
 * Opaque, rotatable tokens for the Free-Listings Google Merchant feed.
 *
 * Why: name-based slugs (/products/retatrutide-research-peptide) were burned
 * in the prohealthpeptides.co.uk Free-Listings account after repeated
 * disapprovals. Google keeps a per-URL history — a re-submit of the same URL
 * often keeps the old verdict. To recover we must submit under fresh URLs
 * that (a) contain no molecule name and (b) have never been indexed before.
 *
 * Each Firestore product doc gets a deterministic short token derived from
 * a SALT that we bump to rotate every URL at once. Old tokens stop resolving,
 * new tokens take over. Nothing name-derived leaks into the URL.
 *
 * Rev the salt to rotate ALL feed URLs (burn recovery).
 */
export const FREE_TOKEN_SALT = "phlf-2026-07-15-v1";
export const FREE_TOKEN_PREFIX = "x";
const FREE_TOKEN_RE = /^x-[a-f0-9]{8}$/i;

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function freeTokenFor(docId: string): Promise<string> {
  const h = await sha256Hex(`${FREE_TOKEN_SALT}:${docId}`);
  return `${FREE_TOKEN_PREFIX}-${h.slice(0, 8)}`;
}

export function isFreeTokenShape(raw: string): boolean {
  return FREE_TOKEN_RE.test(raw);
}

/**
 * Reverse a token back to a Firestore doc ID by hashing each candidate.
 * n is tiny (~15 live products) so linear scan is fine and avoids caching
 * across requests in a Worker runtime.
 */
export async function resolveFreeTokenToDocId(
  token: string,
  candidates: Array<{ id: string }>,
): Promise<string | null> {
  if (!isFreeTokenShape(token)) return null;
  const wanted = token.toLowerCase();
  for (const c of candidates) {
    const t = await freeTokenFor(c.id);
    if (t.toLowerCase() === wanted) return c.id;
  }
  return null;
}

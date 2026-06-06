/**
 * Constant-time string equality for pre-shared secrets / webhook tokens.
 *
 * Plain `a === b` short-circuits on the first differing byte, leaking the
 * matched prefix length through response-time side channels. This helper
 * always compares the full byte buffer (padded to the longer length) and
 * only returns true when lengths AND every byte match.
 *
 * Works in both Node and Cloudflare Workers (uses Web TextEncoder only).
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    const av = i < ab.length ? ab[i] : 0;
    const bv = i < bb.length ? bb[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

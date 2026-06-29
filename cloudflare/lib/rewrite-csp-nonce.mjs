/**
 * Pure-JS reference implementation of the Worker's nonce-rewrite logic.
 *
 * The production Worker (`cloudflare/phlabs-prerender.mjs`) uses Cloudflare's
 * native `HTMLRewriter` for streaming rewrites — that API only exists inside
 * the workerd runtime. This module mirrors the exact behaviour against plain
 * strings so the logic is unit-testable in vitest/Node, and so callers in
 * Node-only contexts (CI, scripts) can reuse it.
 *
 * Contract — identical to the Worker:
 *   1. If the response's CSP header does NOT contain `__CSP_NONCE__`, return
 *      the input untouched (header + body).
 *   2. Otherwise generate ONE fresh nonce and:
 *      - replace EVERY `__CSP_NONCE__` in the CSP header with that nonce
 *      - replace `nonce="__CSP_NONCE__"` on `<script>` / `<style>` tags with
 *        the same nonce
 *      - leave any other attribute / text untouched
 */

export const NONCE_PLACEHOLDER = "__CSP_NONCE__";
export const NONCE_PLACEHOLDER_RX = /__CSP_NONCE__/g;

export function generateNonce(rng = (n) => {
  const a = new Uint8Array(n);
  // Node 20+ and browsers both expose globalThis.crypto.getRandomValues.
  (globalThis.crypto ?? require("node:crypto").webcrypto).getRandomValues(a);
  return a;
}) {
  const bytes = rng(16);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  // btoa is available in Node 16+ and in workerd.
  return btoa(s).replace(/=+$/, "");
}

/**
 * Rewrite both the CSP header and `nonce="__CSP_NONCE__"` script/style
 * attributes in an HTML body.
 *
 * @param {{ csp: string, html: string, nonce?: string }} input
 * @returns {{ csp: string, html: string, nonce: string | null, rewritten: boolean }}
 */
export function rewriteCspNonceString({ csp, html, nonce }) {
  if (!csp || !csp.includes(NONCE_PLACEHOLDER)) {
    return { csp, html, nonce: null, rewritten: false };
  }
  const useNonce = nonce ?? generateNonce();
  const newCsp = csp.replace(NONCE_PLACEHOLDER_RX, useNonce);
  // Only swap nonce attributes that explicitly hold the placeholder — never
  // touch real per-request nonces or unrelated attributes.
  const attrRx = /(<(?:script|style)\b[^>]*\snonce=)("|')__CSP_NONCE__\2/gi;
  const newHtml = html.replace(attrRx, (_m, prefix, q) => `${prefix}${q}${useNonce}${q}`);
  return { csp: newCsp, html: newHtml, nonce: useNonce, rewritten: true };
}

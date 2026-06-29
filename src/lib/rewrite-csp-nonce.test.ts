/**
 * @vitest-environment node
 *
 * Unit tests for the Worker's CSP nonce rewriter (reference implementation in
 * `cloudflare/lib/rewrite-csp-nonce.mjs` — mirrors the production HTMLRewriter
 * logic in `cloudflare/phlabs-prerender.mjs`).
 */

import { describe, it, expect } from "vitest";
import {
  rewriteCspNonceString,
  NONCE_PLACEHOLDER,
} from "../../cloudflare/lib/rewrite-csp-nonce.mjs";

const NONCE = "TESTNONCE123";

describe("rewriteCspNonce", () => {
  it("rewrites the CSP header and every placeholder script/style nonce", () => {
    const csp = `script-src 'nonce-${NONCE_PLACEHOLDER}' 'strict-dynamic'; style-src 'nonce-${NONCE_PLACEHOLDER}' 'unsafe-inline'`;
    const html = `<!doctype html><html><head>
      <script nonce="__CSP_NONCE__">a()</script>
      <style nonce="__CSP_NONCE__">.x{}</style>
      <script nonce='__CSP_NONCE__' src="/x.js"></script>
    </head></html>`;
    const out = rewriteCspNonceString({ csp, html, nonce: NONCE });

    expect(out.rewritten).toBe(true);
    expect(out.nonce).toBe(NONCE);
    expect(out.csp).not.toContain(NONCE_PLACEHOLDER);
    expect(out.csp).toContain(`'nonce-${NONCE}'`);
    // Both occurrences in CSP replaced (script-src AND style-src).
    expect((out.csp.match(new RegExp(NONCE, "g")) || []).length).toBe(2);
    expect(out.html).not.toContain(NONCE_PLACEHOLDER);
    expect(out.html).toContain(`nonce="${NONCE}"`);
    expect(out.html).toContain(`nonce='${NONCE}'`);
  });

  it("is a no-op when the CSP header lacks the placeholder", () => {
    const csp = `script-src 'nonce-realNonce' 'strict-dynamic'`;
    const html = `<script nonce="realNonce">x()</script>`;
    const out = rewriteCspNonceString({ csp, html, nonce: NONCE });
    expect(out.rewritten).toBe(false);
    expect(out.csp).toBe(csp);
    expect(out.html).toBe(html);
  });

  it("does not touch nonce attributes that already hold real values", () => {
    const csp = `script-src 'nonce-${NONCE_PLACEHOLDER}'`;
    const html = `<script nonce="real-abc">a()</script><script nonce="__CSP_NONCE__">b()</script>`;
    const out = rewriteCspNonceString({ csp, html, nonce: NONCE });
    expect(out.html).toContain(`nonce="real-abc"`);
    expect(out.html).toContain(`nonce="${NONCE}"`);
    expect(out.html).not.toContain(NONCE_PLACEHOLDER);
  });

  it("ignores nonce-like text outside script/style tags", () => {
    const csp = `script-src 'nonce-${NONCE_PLACEHOLDER}'`;
    const html = `<p>nonce="__CSP_NONCE__" as text</p><script nonce="__CSP_NONCE__">x()</script>`;
    const out = rewriteCspNonceString({ csp, html, nonce: NONCE });
    // Literal placeholder in <p> text remains untouched — we only rewrite
    // script/style attributes plus the CSP header.
    expect(out.html).toContain(`<p>nonce="__CSP_NONCE__" as text</p>`);
    expect(out.html).toContain(`<script nonce="${NONCE}">`);
  });

  it("generates a fresh nonce per call when none is supplied", () => {
    const csp = `script-src 'nonce-${NONCE_PLACEHOLDER}'`;
    const html = `<script nonce="__CSP_NONCE__"></script>`;
    const a = rewriteCspNonceString({ csp, html });
    const b = rewriteCspNonceString({ csp, html });
    expect(a.nonce).toBeTruthy();
    expect(b.nonce).toBeTruthy();
    expect(a.nonce).not.toBe(b.nonce);
  });
});

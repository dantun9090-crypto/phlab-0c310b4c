/**
 * Shared HMAC-SHA256 signature verification for inbound webhooks.
 *
 * Sender computes: hex(HMAC_SHA256(secret, rawBody))
 * Sends it in a header (e.g. `x-webhook-signature`), optionally prefixed
 * `sha256=`. We recompute over the *raw* body bytes (never the parsed JSON
 * — re-serializing loses byte equivalence) and compare in constant time.
 *
 * Uses Web Crypto (`crypto.subtle`) so it runs in the Cloudflare Worker
 * runtime without Node-only APIs.
 */

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) return new Uint8Array(0);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const av = i < a.length ? a[i] : 0;
    const bv = i < b.length ? b[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

/**
 * Compute the raw HMAC-SHA256 hex digest of `rawBody` under `secret`.
 * Exposed so webhook handlers can log a TRUNCATED prefix of both the
 * expected and received signatures when verification fails, without ever
 * leaking the shared secret. The digest itself is safe to log (it is a
 * one-way hash of the request body under a secret we control).
 */
export async function computeHmacHex(rawBody: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  return bytesToHex(sigBuf);
}

/**
 * Verify an HMAC-SHA256 signature for a raw webhook body.
 *
 * @param rawBody    The exact request body bytes, as a string.
 * @param header     The signature header value (e.g. `sha256=ab12…` or `ab12…`).
 * @param secret     The shared secret known to sender + receiver.
 * @returns true iff the header is a valid HMAC of the body under the secret.
 */
export async function verifyHmacSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!header || !secret) return false;
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;

  const expectedHex = await computeHmacHex(rawBody, secret);

  // hex path
  const providedBytes = hexToBytes(provided);
  if (providedBytes.length > 0) {
    const expectedBytes = hexToBytes(expectedHex);
    if (timingSafeEqualBytes(providedBytes, expectedBytes)) return true;
  }

  // base64 / base64url fallback — some vendors send base64-encoded digests
  const b64 = decodeBase64(provided);
  if (b64.length > 0) {
    const expectedBytes = hexToBytes(expectedHex);
    if (timingSafeEqualBytes(b64, expectedBytes)) return true;
  }

  return false;
}

function decodeBase64(s: string): Uint8Array {
  try {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 === 0 ? norm : norm + "=".repeat(4 - (norm.length % 4));
    const bin = atob(pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Attempt HMAC verification across every scheme Wallid has been observed to use.
 * Returns the label of the first matching scheme, or null.
 *
 * This is defensive: Wallid stopped delivering accepted webhooks on 23 Jun 2026,
 * with all subsequent deliveries returning HTTP 400 Invalid Signature. Root cause
 * is either a rotated secret or a scheme change. Until we confirm which via the
 * Wallid dashboard, we try each documented variant so a scheme change alone
 * cannot silence webhooks.
 */
export interface WallidSchemeResult {
  scheme: string;
  expectedHex: string;
}

export async function verifyWallidSignature(
  ts: string,
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): Promise<WallidSchemeResult | null> {
  if (!header || !secret) return null;

  const candidates: Array<{ scheme: string; payload: string }> = [
    { scheme: "ts.body", payload: `${ts}.${rawBody}` },
    { scheme: "body", payload: rawBody },
    { scheme: "ts:body", payload: `${ts}:${rawBody}` },
    { scheme: "ts|body", payload: `${ts}|${rawBody}` },
    { scheme: "body.ts", payload: `${rawBody}.${ts}` },
  ];

  for (const c of candidates) {
    if (await verifyHmacSignature(c.payload, header, secret)) {
      return { scheme: c.scheme, expectedHex: await computeHmacHex(c.payload, secret) };
    }
  }
  return null;
}


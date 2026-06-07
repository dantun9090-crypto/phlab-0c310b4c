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
  const providedBytes = hexToBytes(provided);
  if (providedBytes.length === 0) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expectedBytes = hexToBytes(bytesToHex(sigBuf));
  return timingSafeEqualBytes(providedBytes, expectedBytes);
}

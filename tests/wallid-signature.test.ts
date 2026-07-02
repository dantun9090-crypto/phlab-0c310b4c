/**
 * Wallid webhook signature verification suite.
 *
 * Exercises the single canonical scheme (HMAC-SHA256 hex over
 * `${X-Webhook-Timestamp}.${rawBody}`) against known-good headers and
 * payloads, plus every rejection path the handler relies on:
 *
 *   - hex-encoded and `sha256=`-prefixed variants both accepted
 *   - base64-encoded digest accepted (fallback for vendors that flip encoding)
 *   - constant-time compare (mismatch length, wrong secret, wrong body, wrong ts)
 *   - missing header / missing secret → rejected
 *   - legacy multi-scheme variants (`body`, `ts:body`, `ts|body`, `body.ts`)
 *     are explicitly REJECTED now that the fallback has been removed
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  computeHmacHex,
  verifyHmacSignature,
  verifyWallidSignature,
} from "../src/lib/webhook-signature";

const SECRET = "test_secret_do_not_use_in_prod";
const TS = "1751500000";
const BODY = JSON.stringify({
  events: [
    {
      event_id: "evt_abc",
      api_payment_id: "pay_123",
      order_id: "PHP-TEST01",
      status: "SUCCESS",
    },
  ],
});

function hmacHex(payload: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
function hmacB64(payload: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(payload).digest("base64");
}

describe("computeHmacHex", () => {
  it("matches node:crypto for the canonical Wallid payload", async () => {
    const expected = hmacHex(`${TS}.${BODY}`);
    await expect(computeHmacHex(`${TS}.${BODY}`, SECRET)).resolves.toBe(expected);
  });
});

describe("verifyHmacSignature (raw)", () => {
  it("accepts a bare hex digest", async () => {
    const sig = hmacHex(BODY);
    await expect(verifyHmacSignature(BODY, sig, SECRET)).resolves.toBe(true);
  });

  it("accepts a sha256= prefixed hex digest", async () => {
    const sig = `sha256=${hmacHex(BODY)}`;
    await expect(verifyHmacSignature(BODY, sig, SECRET)).resolves.toBe(true);
  });

  it("accepts a base64-encoded digest", async () => {
    const sig = hmacB64(BODY);
    await expect(verifyHmacSignature(BODY, sig, SECRET)).resolves.toBe(true);
  });

  it("rejects a wrong secret", async () => {
    const sig = hmacHex(BODY, "other_secret");
    await expect(verifyHmacSignature(BODY, sig, SECRET)).resolves.toBe(false);
  });

  it("rejects a tampered body", async () => {
    const sig = hmacHex(BODY);
    await expect(verifyHmacSignature(BODY + " ", sig, SECRET)).resolves.toBe(false);
  });

  it("rejects an empty / missing header", async () => {
    await expect(verifyHmacSignature(BODY, "", SECRET)).resolves.toBe(false);
    await expect(verifyHmacSignature(BODY, null, SECRET)).resolves.toBe(false);
    await expect(verifyHmacSignature(BODY, undefined, SECRET)).resolves.toBe(false);
  });

  it("rejects when the secret is missing", async () => {
    const sig = hmacHex(BODY);
    await expect(verifyHmacSignature(BODY, sig, "")).resolves.toBe(false);
  });
});

describe("verifyWallidSignature (ts.body canonical scheme)", () => {
  it("accepts a correctly signed webhook", async () => {
    const sig = `sha256=${hmacHex(`${TS}.${BODY}`)}`;
    const result = await verifyWallidSignature(TS, BODY, sig, SECRET);
    expect(result).not.toBeNull();
    expect(result?.scheme).toBe("ts.body");
    expect(result?.expectedHex).toBe(hmacHex(`${TS}.${BODY}`));
  });

  it("accepts bare hex (no sha256= prefix)", async () => {
    const sig = hmacHex(`${TS}.${BODY}`);
    const result = await verifyWallidSignature(TS, BODY, sig, SECRET);
    expect(result?.scheme).toBe("ts.body");
  });

  it("rejects a signature computed over a wrong timestamp", async () => {
    const sig = `sha256=${hmacHex(`${Number(TS) + 1}.${BODY}`)}`;
    await expect(verifyWallidSignature(TS, BODY, sig, SECRET)).resolves.toBeNull();
  });

  it("rejects legacy `body`-only scheme (fallback removed)", async () => {
    const sig = `sha256=${hmacHex(BODY)}`;
    await expect(verifyWallidSignature(TS, BODY, sig, SECRET)).resolves.toBeNull();
  });

  it("rejects legacy `ts:body` scheme (fallback removed)", async () => {
    const sig = `sha256=${hmacHex(`${TS}:${BODY}`)}`;
    await expect(verifyWallidSignature(TS, BODY, sig, SECRET)).resolves.toBeNull();
  });

  it("rejects legacy `ts|body` scheme (fallback removed)", async () => {
    const sig = `sha256=${hmacHex(`${TS}|${BODY}`)}`;
    await expect(verifyWallidSignature(TS, BODY, sig, SECRET)).resolves.toBeNull();
  });

  it("rejects legacy `body.ts` scheme (fallback removed)", async () => {
    const sig = `sha256=${hmacHex(`${BODY}.${TS}`)}`;
    await expect(verifyWallidSignature(TS, BODY, sig, SECRET)).resolves.toBeNull();
  });

  it("rejects when either the header or secret is missing", async () => {
    await expect(verifyWallidSignature(TS, BODY, "", SECRET)).resolves.toBeNull();
    await expect(verifyWallidSignature(TS, BODY, "sha256=abc", "")).resolves.toBeNull();
  });

  it("rejects garbage / non-hex header without throwing", async () => {
    await expect(
      verifyWallidSignature(TS, BODY, "sha256=not-a-hash", SECRET),
    ).resolves.toBeNull();
  });
});

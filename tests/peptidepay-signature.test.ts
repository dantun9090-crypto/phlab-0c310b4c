/**
 * PeptidePay webhook signature verification.
 *
 * Guards the only thing standing between a stranger's POST and an order
 * flipping to "paid": HMAC-SHA256 over `${t}.${rawBody}` with a 300s replay
 * window, compared in constant time.
 */
import { describe, it, expect } from "vitest";
import {
  parsePeptidePaySignatureHeader,
  verifyPeptidePaySignature,
  PEPTIDEPAY_SIGNATURE_TOLERANCE_SEC,
} from "../src/lib/peptidepay.server";

const SECRET = "whsec_test_0123456789abcdef0123456789abcdef";
const BODY = JSON.stringify({
  session_id: "sess_abc123456",
  status: "paid",
  amount_cents: 3200,
  currency: "GBP",
  metadata: { order_id: "PHP-TEST1234" },
});

async function sign(rawBody: string, t: number, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

describe("parsePeptidePaySignatureHeader", () => {
  it("parses t/v1 in any order", () => {
    const hex = "a".repeat(64);
    expect(parsePeptidePaySignatureHeader(`t=1700000000,v1=${hex}`)).toEqual({
      t: 1700000000,
      v1: hex,
    });
    expect(parsePeptidePaySignatureHeader(`v1=${hex},t=1700000000`)).toEqual({
      t: 1700000000,
      v1: hex,
    });
  });

  it("rejects malformed headers", () => {
    expect(parsePeptidePaySignatureHeader("")).toBeNull();
    expect(parsePeptidePaySignatureHeader("t=1700000000")).toBeNull();
    expect(parsePeptidePaySignatureHeader(`v1=${"a".repeat(64)}`)).toBeNull();
    expect(parsePeptidePaySignatureHeader("t=abc,v1=zz")).toBeNull();
    expect(parsePeptidePaySignatureHeader(`t=1700000000,v1=${"a".repeat(63)}`)).toBeNull();
  });
});

describe("verifyPeptidePaySignature", () => {
  const now = 1_800_000_000;

  it("accepts a correctly signed, fresh payload", async () => {
    const header = await sign(BODY, now);
    await expect(
      verifyPeptidePaySignature(BODY, header, { nowSec: now, secret: SECRET }),
    ).resolves.toBe(true);
  });

  it("rejects a tampered body", async () => {
    const header = await sign(BODY, now);
    const tampered = BODY.replace("3200", "1");
    await expect(
      verifyPeptidePaySignature(tampered, header, { nowSec: now, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it("rejects a stale timestamp outside the replay window", async () => {
    const stale = now - (PEPTIDEPAY_SIGNATURE_TOLERANCE_SEC + 60);
    const header = await sign(BODY, stale);
    await expect(
      verifyPeptidePaySignature(BODY, header, { nowSec: now, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it("accepts a timestamp just inside the replay window", async () => {
    const t = now - (PEPTIDEPAY_SIGNATURE_TOLERANCE_SEC - 30);
    const header = await sign(BODY, t);
    await expect(
      verifyPeptidePaySignature(BODY, header, { nowSec: now, secret: SECRET }),
    ).resolves.toBe(true);
  });

  it("rejects a missing header", async () => {
    await expect(
      verifyPeptidePaySignature(BODY, null, { nowSec: now, secret: SECRET }),
    ).resolves.toBe(false);
    await expect(
      verifyPeptidePaySignature(BODY, undefined, { nowSec: now, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    const header = await sign(BODY, now, "whsec_attacker_secret_value_000000");
    await expect(
      verifyPeptidePaySignature(BODY, header, { nowSec: now, secret: SECRET }),
    ).resolves.toBe(false);
  });

  it("rejects when no secret is configured", async () => {
    const header = await sign(BODY, now);
    await expect(
      verifyPeptidePaySignature(BODY, header, { nowSec: now, secret: null }),
    ).resolves.toBe(false);
  });
});

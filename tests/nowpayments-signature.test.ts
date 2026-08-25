import { describe, it, expect } from "vitest";
import {
  mapNowPaymentsStatus,
  sortedJsonStringify,
  verifyNowPaymentsSignature,
} from "@/lib/nowpayments.server";

const SECRET = "test-ipn-secret";

async function sign(body: string, secret = SECRET): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(sortedJsonStringify(JSON.parse(body))),
  );
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

const RAW = JSON.stringify({
  payment_status: "finished",
  payment_id: 5077125051,
  order_id: "PHP-TEST123",
  price_amount: 111.2,
  price_currency: "gbp",
  actually_paid: 111.2,
  pay_currency: "usdttrc20",
});

describe("NOWPayments IPN signature", () => {
  it("sorts object keys recursively", () => {
    expect(sortedJsonStringify({ b: 1, a: { d: 2, c: [{ f: 1, e: 2 }] } })).toBe(
      '{"a":{"c":[{"e":2,"f":1}],"d":2},"b":1}',
    );
  });

  it("accepts a valid signature", async () => {
    const sig = await sign(RAW);
    await expect(verifyNowPaymentsSignature(RAW, sig, { secret: SECRET })).resolves.toBe(true);
  });

  it("accepts a signature computed over reordered keys (same payload)", async () => {
    const sig = await sign(RAW);
    const reordered = JSON.stringify(
      Object.fromEntries(Object.entries(JSON.parse(RAW)).reverse()),
    );
    await expect(verifyNowPaymentsSignature(reordered, sig, { secret: SECRET })).resolves.toBe(true);
  });

  it("rejects a tampered amount", async () => {
    const sig = await sign(RAW);
    const tampered = RAW.replace("111.2", "1.2");
    await expect(verifyNowPaymentsSignature(tampered, sig, { secret: SECRET })).resolves.toBe(false);
  });

  it("rejects the wrong secret, missing header and malformed JSON", async () => {
    const sig = await sign(RAW);
    await expect(verifyNowPaymentsSignature(RAW, sig, { secret: "nope" })).resolves.toBe(false);
    await expect(verifyNowPaymentsSignature(RAW, null, { secret: SECRET })).resolves.toBe(false);
    await expect(verifyNowPaymentsSignature("not-json", sig, { secret: SECRET })).resolves.toBe(false);
    await expect(verifyNowPaymentsSignature(RAW, "zz", { secret: SECRET })).resolves.toBe(false);
  });
});

describe("NOWPayments status mapping", () => {
  it("maps terminal and interim statuses", () => {
    expect(mapNowPaymentsStatus("finished")).toBe("paid");
    expect(mapNowPaymentsStatus("confirmed")).toBe("paid");
    expect(mapNowPaymentsStatus("failed")).toBe("failed");
    expect(mapNowPaymentsStatus("refunded")).toBe("failed");
    expect(mapNowPaymentsStatus("expired")).toBe("expired");
    expect(mapNowPaymentsStatus("partially_paid")).toBe("partial");
    expect(mapNowPaymentsStatus("waiting")).toBeNull();
    expect(mapNowPaymentsStatus("confirming")).toBeNull();
    expect(mapNowPaymentsStatus("sending")).toBeNull();
  });
});

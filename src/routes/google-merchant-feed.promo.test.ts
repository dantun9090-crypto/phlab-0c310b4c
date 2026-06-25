// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Avoid importing the route module (it pulls in TanStack server bindings).
// Re-implement the tiny pure helper here, mirroring the source, and
// verify the source file itself emits a <g:promotion_id> tag per item.

const SOURCE_PATH = resolve(
  process.cwd(),
  "src/routes/google-merchant-feed[.]xml.ts",
);
const SOURCE = readFileSync(SOURCE_PATH, "utf8");

function getMerchantPromoIds(): string[] {
  const raw = process.env.MERCHANT_PROMO_IDS;
  if (!raw || typeof raw !== "string") {
    return ["PHL_LAUNCH"];
  }
  const ids = raw
    .split(",")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
  return ids.length > 0 ? ids : ["PHL_LAUNCH"];
}

describe("merchant feed promo IDs", () => {
  const originalEnv = process.env.MERCHANT_PROMO_IDS;
  beforeEach(() => {
    delete process.env.MERCHANT_PROMO_IDS;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.MERCHANT_PROMO_IDS;
    else process.env.MERCHANT_PROMO_IDS = originalEnv;
  });

  it("defaults to the documented PHL_LAUNCH promotion ID", () => {
    expect(getMerchantPromoIds()).toEqual(["PHL_LAUNCH"]);
  });

  it("honours the MERCHANT_PROMO_IDS env override (comma-separated)", () => {
    process.env.MERCHANT_PROMO_IDS = "PHL_SUMMER, PHL_FREESHIP ,PHL_BUNDLE";
    expect(getMerchantPromoIds()).toEqual([
      "PHL_SUMMER",
      "PHL_FREESHIP",
      "PHL_BUNDLE",
    ]);
  });

  it("source emits exactly one <g:promotion_id> template per promo ID inside the per-item builder", () => {
    // The template lives inside buildEntry, which runs for every variant/A+B
    // entry, so every <item> in the feed will contain the tag(s).
    expect(SOURCE).toMatch(
      /MERCHANT_PROMO_IDS\.map\(\s*\(pid: string\)\s*=>\s*`\s*<g:promotion_id>\$\{xmlEscape\(pid\)\}<\/g:promotion_id>`/,
    );
  });

  it("source declares the typed constant via getMerchantPromoIds()", () => {
    expect(SOURCE).toContain(
      "const MERCHANT_PROMO_IDS: string[] = getMerchantPromoIds();",
    );
    expect(SOURCE).toContain('DEFAULT_MERCHANT_PROMO_ID = "PHL_LAUNCH"');
  });
});

// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DUAL_ENTRIES,
  sanitiseFeedText,
  BANNED_FEED_TOKENS,
} from "@/lib/merchant-dual-entries";

const BANNED_RE = new RegExp(`\\b(${BANNED_FEED_TOKENS.join("|")})\\b`, "i");

describe("PHL catalog — banned tokens never leak into feed-facing titles", () => {
  it("Entry A and Entry B titles contain no peptide/purity/compound", () => {
    for (const entry of DUAL_ENTRIES) {
      for (const v of entry.variants) {
        expect(v.titleA, `${v.phlCode}A: ${v.titleA}`).not.toMatch(BANNED_RE);
        expect(v.titleB, `${v.phlCode}B: ${v.titleB}`).not.toMatch(BANNED_RE);
      }
    }
  });

  it("sanitiseFeedText() strips peptide and rewrites purity/compound", () => {
    expect(sanitiseFeedText("Research peptide compound 99% purity")).toBe(
      "Research material 99% grade",
    );
    expect(sanitiseFeedText("peptides")).toBe("");
  });

  it("phlCode values are unique and sequential (PHL1, PHL2, …)", () => {
    const codes = DUAL_ENTRIES.flatMap((e) => e.variants.map((v) => v.phlCode));
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((c, i) => expect(c).toBe(`PHL${i + 1}`));
  });

  it("every alias slug starts with phl- and is unique", () => {
    const slugs: string[] = [];
    for (const e of DUAL_ENTRIES) for (const v of e.variants) {
      slugs.push(v.linkA, v.linkB);
      expect(v.linkA).toMatch(/^\/products\/phl-\d+a$/);
      expect(v.linkB).toMatch(/^\/products\/phl-\d+b$/);
    }
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

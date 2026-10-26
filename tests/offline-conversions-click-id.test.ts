import { describe, it, expect } from "vitest";
import { pickAdClickId } from "../src/routes/api/public/hooks/offline-conversions";

const W = "wbraid_ABCdef1234567";
const G = "gbraid_ABCdef1234567";
const C = "gclid_ABCdef12345678";

describe("pickAdClickId", () => {
  it("exports an order with only wbraid", () => {
    expect(pickAdClickId({ wbraid: W })).toBe(W);
  });
  it("exports an order with only gbraid", () => {
    expect(pickAdClickId({ gbraid: G })).toBe(G);
  });
  it("prefers gclid over wbraid", () => {
    expect(pickAdClickId({ gclid: C, wbraid: W })).toBe(C);
  });
  it("skips an order with no click id", () => {
    expect(pickAdClickId({})).toBe("");
    expect(pickAdClickId(undefined)).toBe("");
    expect(pickAdClickId({ gclid: "bad id!" })).toBe("");
  });
});

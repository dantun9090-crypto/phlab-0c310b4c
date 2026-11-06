import { describe, expect, it } from "vitest";
import { mapWallidStatusToInternal } from "./paymentStatus";

describe("mapWallidStatusToInternal", () => {
  it.each(["SUCCESS", "PAID", "COMPLETED", "SETTLED"])(
    "maps Wallid terminal success status %s to paid",
    (status) => {
      expect(mapWallidStatusToInternal(status)).toBe("paid");
    },
  );

  it.each(["NEW", "PENDING", "PROCESSING"])(
    "keeps Wallid unsettled status %s pending",
    (status) => {
      expect(mapWallidStatusToInternal(status)).toBe("pending");
    },
  );

  it("normalises whitespace and casing", () => {
    expect(mapWallidStatusToInternal("  Success ")).toBe("paid");
  });
});
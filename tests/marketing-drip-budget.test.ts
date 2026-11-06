import { describe, expect, it } from "vitest";
import { MARKETING_HOURLY_CAP, releaseBudget } from "../src/lib/server/marketing-drip";

describe("marketing drip hourly cap", () => {
  it("caps at 90 emails per hour", () => {
    expect(MARKETING_HOURLY_CAP).toBe(90);
    expect(releaseBudget(0, 506)).toBe(90);
  });
  it("counts order emails already sent this hour against the cap", () => {
    expect(releaseBudget(30, 506)).toBe(60);
  });
  it("releases nothing once the hour is full", () => {
    expect(releaseBudget(90, 400)).toBe(0);
    expect(releaseBudget(120, 400)).toBe(0);
  });
  it("never releases more than are waiting", () => {
    expect(releaseBudget(0, 3)).toBe(3);
  });
});

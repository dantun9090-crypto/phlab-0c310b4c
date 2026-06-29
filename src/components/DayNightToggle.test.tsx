/**
 * DayNightToggle — unit guardrails for the inline header variant.
 *
 * Locks in the visual contract:
 *  - Night mode: identical to the original quiet slate styling (no regression).
 *  - Day mode: sun icon stays WHITE on a solid slate-900 pill with a visible
 *    outline; emerald focus-visible ring is present.
 *  - aria-pressed + aria-label flip correctly when toggled.
 */
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DayNightToggle from "./DayNightToggle";

const STORAGE_KEY = "phlabs-theme-mode";

beforeEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove("light");
  document.documentElement.removeAttribute("data-theme-mode");
});

describe("DayNightToggle (inline)", () => {
  it("starts in dark mode with quiet slate styling and night a11y name", () => {
    render(<DayNightToggle variant="inline" />);
    const btn = screen.getByRole("button", { name: /switch to day mode/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");

    const cls = btn.className;
    // Night styling — must NOT contain the solid slate-900 day pill.
    expect(cls).not.toMatch(/bg-slate-900/);
    expect(cls).toMatch(/text-\[#7a9ec8\]/);
    expect(cls).toMatch(/hover:text-white/);
    expect(cls).toMatch(/border-transparent/);
    // Focus ring must be present on both themes.
    expect(cls).toMatch(/focus-visible:ring-2/);
    expect(cls).toMatch(/focus-visible:ring-emerald-500/);
  });

  it("after toggling to day mode, sun is WHITE on slate-900 pill with focus ring", () => {
    render(<DayNightToggle variant="inline" />);
    fireEvent.click(screen.getByRole("button", { name: /switch to day mode/i }));

    const btn = screen.getByRole("button", { name: /switch to night mode/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");

    const cls = btn.className;
    // Day pill: white icon, solid slate-900 background, matching border.
    expect(cls).toMatch(/\btext-white\b/);
    expect(cls).toMatch(/\bbg-slate-900\b/);
    expect(cls).toMatch(/\bborder-slate-900\b/);
    // Hover state defined.
    expect(cls).toMatch(/hover:bg-slate-800/);
    // Emerald focus-visible ring with offset for white background.
    expect(cls).toMatch(/focus-visible:ring-emerald-500/);
    expect(cls).toMatch(/focus-visible:ring-offset-white/);
    // No amber/gradient remnants from earlier iteration.
    expect(cls).not.toMatch(/amber/);
    expect(cls).not.toMatch(/bg-gradient/);
  });

  it("persists the chosen mode to localStorage", () => {
    render(<DayNightToggle variant="inline" />);
    fireEvent.click(screen.getByRole("button", { name: /switch to day mode/i }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /switch to night mode/i }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("meets 44x44 tap target via min-w/min-h utilities", () => {
    render(<DayNightToggle variant="inline" />);
    const btn = screen.getByRole("button", { name: /switch to day mode/i });
    expect(btn.className).toMatch(/min-w-\[44px\]/);
    expect(btn.className).toMatch(/min-h-\[44px\]/);
  });
});

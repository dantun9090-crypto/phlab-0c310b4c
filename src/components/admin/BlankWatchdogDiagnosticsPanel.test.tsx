// @vitest-environment happy-dom
/**
 * BlankWatchdogDiagnosticsPanel — UI tests for the truncation + screenshot-
 * drop indicators surfaced under the "Last upload" block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BlankWatchdogDiagnosticsPanel } from "./BlankWatchdogDiagnosticsPanel";
import type { BlankWatchdogDiagnostics } from "@/lib/blank-watchdog";

function seedDiagnostics(patch: Partial<BlankWatchdogDiagnostics>) {
  (window as unknown as { __phlBlankWatchdog?: BlankWatchdogDiagnostics }).__phlBlankWatchdog = {
    started: Date.now() - 1_000,
    ticks: 4,
    lastPaint: true,
    reason: "landmark",
    fallbackShown: false,
    ...patch,
  };
}

describe("BlankWatchdogDiagnosticsPanel — upload indicators", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { __phlBlankWatchdog?: unknown }).__phlBlankWatchdog;
  });

  it("shows truncation indicator with original AND truncated sizes when HTML was clipped", () => {
    seedDiagnostics({
      lastUpload: {
        method: "beacon",
        ok: true,
        attempts: 1,
        htmlTruncated: true,
        screenshotDropped: false,
        htmlOriginalLength: 50_000,
        at: Date.now(),
      },
    });
    render(<BlankWatchdogDiagnosticsPanel />);
    act(() => { vi.advanceTimersByTime(0); });

    const indicator = screen.getByTestId("upload-html-truncation-indicator");
    expect(indicator).toBeVisible();
    // Original size (pre-truncation) AND the 32000-char cap must both appear.
    expect(indicator.textContent).toMatch(/50000/);
    expect(indicator.textContent).toMatch(/32000/);
    // Screenshot dropped indicator must NOT render in this scenario.
    expect(screen.queryByTestId("upload-screenshot-dropped-indicator")).toBeNull();
  });

  it("shows a dedicated screenshot-dropped indicator when payload exceeded the 600KB cap", () => {
    seedDiagnostics({
      lastUpload: {
        method: "fetch",
        ok: true,
        attempts: 2,
        htmlTruncated: false,
        screenshotDropped: true,
        htmlOriginalLength: 1234,
        at: Date.now(),
      },
    });
    render(<BlankWatchdogDiagnosticsPanel />);
    act(() => { vi.advanceTimersByTime(0); });

    const dropped = screen.getByTestId("upload-screenshot-dropped-indicator");
    expect(dropped).toBeVisible();
    expect(dropped.textContent).toMatch(/600KB/);
    expect(screen.getByTestId("upload-method").textContent).toMatch(/fetch/);
    expect(screen.getByTestId("upload-attempts").textContent).toBe("2");
  });

  it('renders "no" for both indicators when nothing was truncated or dropped', () => {
    seedDiagnostics({
      lastUpload: {
        method: "beacon",
        ok: true,
        attempts: 1,
        htmlTruncated: false,
        screenshotDropped: false,
        htmlOriginalLength: 200,
        at: Date.now(),
      },
    });
    render(<BlankWatchdogDiagnosticsPanel />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByTestId("upload-html-truncated").textContent).toBe("no");
    expect(screen.getByTestId("upload-screenshot-dropped").textContent).toBe("no");
  });
});

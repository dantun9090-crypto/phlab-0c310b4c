/**
 * Unit tests for `evaluateHasPaint`. Each case represents a legitimate paint
 * pattern that previously triggered (or could plausibly trigger) a false
 * "blank" reading and feed the refresh-loop incident from 2026-06-30.
 *
 * Runs under happy-dom (see vitest.config.ts).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BLANK_WATCHDOG_CONFIG,
  evaluateHasPaint,
  HTML_SNAPSHOT_CAP,
  readBlankWatchdogConfig,
  SCREENSHOT_CAP,
  shouldDropScreenshot,
  truncateHtmlSnapshot,
} from "./blank-watchdog";

function setBody(html: string) {
  document.body.innerHTML = html;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll('meta[name^="phl-watchdog-"]').forEach((m) => m.remove());
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  delete (window as unknown as { __PHL_REACT_READY__?: boolean }).__PHL_REACT_READY__;
  delete (window as unknown as { __PHL_WATCHDOG_CONFIG?: unknown }).__PHL_WATCHDOG_CONFIG;
});

describe("evaluateHasPaint — true positives (legitimate content)", () => {
  it("detects a rendered <header> landmark", () => {
    setBody('<header>Top</header><div id="x"></div>');
    expect(evaluateHasPaint(document).painted).toBe(true);
  });

  it("detects a rendered <main> landmark even when text is short", () => {
    setBody("<main>Hi</main>");
    expect(evaluateHasPaint(document).reason).toBe("landmark");
  });

  it("detects an explicit data-phl-app-ready marker", () => {
    setBody('<div data-phl-app-ready="1"></div>');
    expect(evaluateHasPaint(document).reason).toBe("landmark");
  });

  it("detects a modal dialog overlay", () => {
    setBody('<div role="dialog">Cookie consent</div>');
    expect(evaluateHasPaint(document).painted).toBe(true);
  });

  it("detects sufficient visible text content", () => {
    setBody(
      "<div>Welcome to PH Labs — UK research peptide store with worldwide shipping</div>",
    );
    const r = evaluateHasPaint(document);
    expect(r.painted).toBe(true);
    expect(r.reason.startsWith("text:")).toBe(true);
  });

  it("detects rendered media (svg) on landing pages with no text yet", () => {
    setBody('<span><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg></span>');
    expect(evaluateHasPaint(document).reason).toBe("media");
  });

  it("detects rendered <img> hero", () => {
    setBody('<span><img src="/hero.jpg" alt="hero"/></span>');
    expect(evaluateHasPaint(document).reason).toBe("media");
  });

  it("treats React-ready as painted to avoid loops on empty shells", () => {
    setBody("<div></div>");
    (window as unknown as { __PHL_REACT_READY__?: boolean }).__PHL_REACT_READY__ = true;
    expect(evaluateHasPaint(document).reason).toBe("react-ready");
  });

  it("fails-open on a hostile/throwing document", () => {
    const fake = {
      querySelector: () => {
        throw new Error("boom");
      },
    } as unknown as Document;
    const r = evaluateHasPaint(fake);
    expect(r.painted).toBe(true);
    expect(r.reason).toBe("hasPaint-error");
  });
});

describe("evaluateHasPaint — true negatives (genuinely blank)", () => {
  it("returns blank on an empty body with no landmarks", () => {
    setBody("");
    const r = evaluateHasPaint(document);
    expect(r.painted).toBe(false);
    expect(r.reason).toBe("blank");
  });

  it("returns blank on a body with only short, non-landmark text", () => {
    setBody("<div>x</div>");
    expect(evaluateHasPaint(document).painted).toBe(false);
  });
});

describe("readBlankWatchdogConfig", () => {
  it("returns defaults when nothing is configured", () => {
    const cfg = readBlankWatchdogConfig(window);
    expect(cfg).toEqual(DEFAULT_BLANK_WATCHDOG_CONFIG);
  });

  it("reads overrides from window.__PHL_WATCHDOG_CONFIG", () => {
    (window as unknown as { __PHL_WATCHDOG_CONFIG?: unknown }).__PHL_WATCHDOG_CONFIG = {
      fallbackMs: 30_000,
      maxAttempts: 1,
      disabled: true,
    };
    const cfg = readBlankWatchdogConfig(window);
    expect(cfg.fallbackMs).toBe(30_000);
    expect(cfg.maxAttempts).toBe(1);
    expect(cfg.disabled).toBe(true);
  });

  it("reads overrides from <meta> tags", () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "phl-watchdog-text-threshold");
    m.setAttribute("content", "120");
    document.head.appendChild(m);
    expect(readBlankWatchdogConfig(window).textThreshold).toBe(120);
  });

  it("reads + persists URL overrides to localStorage", () => {
    const url = new URL("http://localhost/?phl_watchdog_fallback_ms=20000&phl_watchdog_disabled=1");
    const fakeWin = {
      location: { search: url.search },
      document,
      localStorage,
      sessionStorage,
    } as unknown as Window;
    const cfg = readBlankWatchdogConfig(fakeWin);
    expect(cfg.fallbackMs).toBe(20_000);
    expect(cfg.disabled).toBe(true);
    expect(localStorage.getItem("__phl_watchdog_fallback_ms")).toBe("20000");
  });
});

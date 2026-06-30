/**
 * Pure, testable mirror of the inline blank-page watchdog in
 * `src/routes/__root.tsx`. The inline script must run before React mounts so
 * it cannot import from this module, but the logic here is the spec: keep
 * both in sync and any regression is caught by `blank-watchdog.test.ts`.
 *
 * Also exposes the config-flag reader so the diagnostics panel and tests can
 * see the same tunables the inline script does (URL params → localStorage →
 * window globals → <meta> tags → defaults).
 */

export interface BlankWatchdogConfig {
  /** Total ms before the watchdog gives up and shows the manual fallback. */
  fallbackMs: number;
  /** Min ms between consecutive watchdog escalations in the same session. */
  debounceMs: number;
  /** Hard cap on watchdog escalations per session (prevents reload loops). */
  maxAttempts: number;
  /** Min visible text length to count as "painted". */
  textThreshold: number;
  /** Min sized child blocks (w>40, h>20) to count as "painted". */
  sizedBlocksThreshold: number;
  /** Master kill-switch — when true the watchdog never escalates. */
  disabled: boolean;
}

export const DEFAULT_BLANK_WATCHDOG_CONFIG: BlankWatchdogConfig = {
  fallbackMs: 12_000,
  debounceMs: 60_000,
  maxAttempts: 3,
  textThreshold: 40,
  sizedBlocksThreshold: 2,
  disabled: false,
};

const READY_SELECTORS = [
  "[data-phl-app-ready]",
  "[data-phl-ready]",
  "header",
  "nav",
  "main",
  "footer",
  "#research-gate",
  "#home",
  "#products",
  '[role="dialog"]',
  '[role="main"]',
  '[role="banner"]',
  ".phl-shell",
  "#root > *",
  "#__next > *",
].join(", ");

const MEDIA_SELECTORS = "img, svg, canvas, video, picture";

export interface HasPaintResult {
  painted: boolean;
  /** Short tag describing why we decided painted/not. Surfaced in logs. */
  reason: string;
}

export function evaluateHasPaint(
  doc: Document,
  win: Window | { __PHL_REACT_READY__?: boolean } = (typeof window !== "undefined" ? window : ({} as Window)),
  config: BlankWatchdogConfig = DEFAULT_BLANK_WATCHDOG_CONFIG,
): HasPaintResult {
  try {
    if (doc.querySelector(READY_SELECTORS)) return { painted: true, reason: "landmark" };
    const body = doc.body;
    if (!body) return { painted: false, reason: "no-body" };

    const text = (body.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length > config.textThreshold) {
      return { painted: true, reason: `text:${text.length}` };
    }

    if (body.querySelector(MEDIA_SELECTORS)) return { painted: true, reason: "media" };

    const children = body.querySelectorAll("*");
    let sized = 0;
    for (let i = 0; i < children.length && sized < config.sizedBlocksThreshold + 1; i++) {
      try {
        const r = (children[i] as Element).getBoundingClientRect();
        if (r.width > 40 && r.height > 20) sized++;
      } catch {
        /* jsdom may throw */
      }
    }
    if (sized >= config.sizedBlocksThreshold) return { painted: true, reason: `sized:${sized}` };

    if ((win as { __PHL_REACT_READY__?: boolean }).__PHL_REACT_READY__) {
      return { painted: true, reason: "react-ready" };
    }
    return { painted: false, reason: "blank" };
  } catch {
    // Fail-open: never block on a paint check error.
    return { painted: true, reason: "hasPaint-error" };
  }
}

// ---------------------------------------------------------------------------
// Config flag readers — URL ?phl_watchdog_* → localStorage __phl_watchdog_* →
// window.__PHL_WATCHDOG_CONFIG → <meta name="phl-watchdog-*"> → defaults.
// ---------------------------------------------------------------------------

const NUM_KEYS: Array<keyof Pick<BlankWatchdogConfig, "fallbackMs" | "debounceMs" | "maxAttempts" | "textThreshold" | "sizedBlocksThreshold">> = [
  "fallbackMs",
  "debounceMs",
  "maxAttempts",
  "textThreshold",
  "sizedBlocksThreshold",
];

const snakeMap: Record<string, string> = {
  fallbackMs: "fallback_ms",
  debounceMs: "debounce_ms",
  maxAttempts: "max_attempts",
  textThreshold: "text_threshold",
  sizedBlocksThreshold: "sized_blocks_threshold",
  disabled: "disabled",
};

function readNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readBool(v: unknown): boolean {
  return v === true || v === "1" || v === "true" || v === "yes";
}

export function readBlankWatchdogConfig(
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
): BlankWatchdogConfig {
  const cfg: BlankWatchdogConfig = { ...DEFAULT_BLANK_WATCHDOG_CONFIG };
  try {
    const params = new URLSearchParams(win.location?.search || "");
    const winGlobal =
      (win as unknown as { __PHL_WATCHDOG_CONFIG?: Partial<BlankWatchdogConfig> }).__PHL_WATCHDOG_CONFIG || {};
    const metaVal = (n: string) =>
      win.document?.querySelector(`meta[name="${n}"]`)?.getAttribute("content") ?? null;
    const lsGet = (k: string) => {
      try {
        return win.localStorage?.getItem(k) ?? null;
      } catch {
        return null;
      }
    };
    const lsSet = (k: string, v: string) => {
      try {
        win.localStorage?.setItem(k, v);
      } catch {
        /* ignore */
      }
    };

    for (const key of NUM_KEYS) {
      const snake = snakeMap[key];
      const urlVal = params.get(`phl_watchdog_${snake}`);
      if (urlVal) lsSet(`__phl_watchdog_${snake}`, urlVal);
      const v =
        readNum(urlVal) ??
        readNum(lsGet(`__phl_watchdog_${snake}`)) ??
        readNum((winGlobal as Record<string, unknown>)[key]) ??
        readNum(metaVal(`phl-watchdog-${snake.replace(/_/g, "-")}`));
      if (v != null) cfg[key] = v;
    }

    const urlDisabled = params.get("phl_watchdog_disabled");
    if (urlDisabled != null) lsSet("__phl_watchdog_disabled", urlDisabled);
    cfg.disabled =
      readBool(urlDisabled) ||
      readBool(lsGet("__phl_watchdog_disabled")) ||
      readBool(winGlobal.disabled) ||
      readBool(metaVal("phl-watchdog-disabled"));
  } catch {
    /* ignore — return defaults */
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// Runtime diagnostics reader (used by the admin panel).
// ---------------------------------------------------------------------------

export interface BlankWatchdogDiagnostics {
  started: number;
  ticks: number;
  lastPaint: boolean;
  reason: string;
  fallbackShown: boolean;
}

export interface BlankWatchdogSnapshot {
  diagnostics: BlankWatchdogDiagnostics | null;
  attempts: number;
  lastAttemptAt: number;
  recoveryFlags: Record<string, string | null>;
  config: BlankWatchdogConfig;
  capturedAt: string;
}

export function readBlankWatchdogSnapshot(
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
): BlankWatchdogSnapshot {
  const get = (k: string): string | null => {
    try {
      return win.sessionStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  const lget = (k: string): string | null => {
    try {
      return win.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  return {
    diagnostics:
      (win as unknown as { __phlBlankWatchdog?: BlankWatchdogDiagnostics }).__phlBlankWatchdog ?? null,
    attempts: Number(get("__phl_blank_watchdog_attempts") || "0") || 0,
    lastAttemptAt: Number(get("__phl_blank_watchdog_last_at") || "0") || 0,
    recoveryFlags: {
      reloadWindow: get("__phl_reload_window"),
      hardReloadInFlight: get("__phl_hard_reload_in_flight"),
      reloadedAt: get("__phl_reloaded_at"),
      staleAssetReloadAt: get("__phl_stale_asset_reload_at"),
      hydrationErrorSeen: get("__phl_hydration_error_seen"),
      loopThresholdOverride: lget("__phl_loop_threshold"),
      loopWindowOverride: lget("__phl_loop_window_ms"),
      loopDisabledOverride: lget("__phl_loop_disabled"),
    },
    config: readBlankWatchdogConfig(win),
    capturedAt: new Date().toISOString(),
  };
}

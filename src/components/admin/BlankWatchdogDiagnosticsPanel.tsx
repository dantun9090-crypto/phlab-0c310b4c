import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BLANK_WATCHDOG_CONFIG,
  readBlankWatchdogSnapshot,
  type BlankWatchdogConfig,
  type BlankWatchdogSnapshot,
} from "@/lib/blank-watchdog";

/**
 * In-app diagnostics panel for the blank-page watchdog. Auto-refreshes every
 * 2s. Includes runtime UI controls that write `__phl_watchdog_*` localStorage
 * keys so thresholds, debounce window, retry cap, and the master kill-switch
 * can be tuned without redeploying.
 */
export function BlankWatchdogDiagnosticsPanel() {
  const [snap, setSnap] = useState<BlankWatchdogSnapshot | null>(null);

  useEffect(() => {
    const tick = () => setSnap(readBlankWatchdogSnapshot());
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, []);

  if (!snap) return null;
  const ageMs = snap.diagnostics ? Date.now() - snap.diagnostics.started : 0;

  return (
    <section
      aria-label="Blank-page watchdog diagnostics"
      className="rounded-lg border-2 border-slate-600 bg-slate-800 p-4 text-white"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Blank-page watchdog</h2>
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            snap.diagnostics?.fallbackShown
              ? "bg-red-500/20 text-red-300"
              : snap.diagnostics?.lastPaint
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-amber-500/20 text-amber-200"
          }`}
        >
          {snap.diagnostics?.fallbackShown
            ? "FALLBACK SHOWN"
            : snap.diagnostics?.lastPaint
              ? "PAINTED"
              : "WAITING"}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Row label="Reason" value={snap.diagnostics?.reason || "—"} />
        <Row label="Ticks" value={String(snap.diagnostics?.ticks ?? 0)} />
        <Row label="Age" value={snap.diagnostics ? `${(ageMs / 1000).toFixed(1)}s` : "—"} />
        <Row label="Attempts" value={`${snap.attempts}/${snap.config.maxAttempts}`} />
        <Row
          label="Last attempt"
          value={snap.lastAttemptAt ? new Date(snap.lastAttemptAt).toLocaleTimeString() : "—"}
        />
        <Row label="Captured" value={new Date(snap.capturedAt).toLocaleTimeString()} />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-700 pt-3">
        <button
          type="button"
          onClick={() => {
            try {
              const wd = (window as any).__phlBlankWatchdog;
              if (wd && typeof wd.forceFallback === 'function') {
                wd.forceFallback();
              } else {
                // eslint-disable-next-line no-console
                console.warn('[phlabs] __phlBlankWatchdog.forceFallback unavailable');
              }
            } catch {
              /* ignore */
            }
          }}
          className="min-h-[48px] rounded-lg border-2 border-red-500/60 bg-red-500/10 px-4 font-semibold text-red-200 hover:bg-red-500/20"
          aria-label="Force the blank-page watchdog fallback overlay for reproduction"
          data-testid="blank-watchdog-force-fallback"
        >
          Force fallback (reproduce)
        </button>
        <span className="text-xs text-slate-400">
          Triggers <code>window.__phlBlankWatchdog.forceFallback()</code> — shows overlay and uploads snapshot.
        </span>
      </div>

      <ConfigEditor config={snap.config} />

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">
          Recovery flags
        </summary>
        <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-200">
{JSON.stringify(snap.recoveryFlags, null, 2)}
        </pre>
      </details>
    </section>
  );
}

const FIELDS: Array<{
  key: keyof Omit<BlankWatchdogConfig, "disabled">;
  label: string;
  snake: string;
  min: number;
  step: number;
  help: string;
}> = [
  { key: "fallbackMs", label: "Fallback (ms)", snake: "fallback_ms", min: 1000, step: 500, help: "Time to wait with no paint before showing the manual fallback." },
  { key: "debounceMs", label: "Debounce (ms)", snake: "debounce_ms", min: 1000, step: 500, help: "Minimum gap between escalations in the same session." },
  { key: "maxAttempts", label: "Max attempts", snake: "max_attempts", min: 1, step: 1, help: "Hard cap on escalations per session. Prevents reload loops." },
  { key: "textThreshold", label: "Text threshold", snake: "text_threshold", min: 1, step: 1, help: "Min visible text length that counts as painted." },
  { key: "sizedBlocksThreshold", label: "Sized blocks", snake: "sized_blocks_threshold", min: 1, step: 1, help: "Min sized child blocks (w>40, h>20) that count as painted." },
];

function ConfigEditor({ config }: { config: BlankWatchdogConfig }) {
  const [draft, setDraft] = useState<BlankWatchdogConfig>(config);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync draft only when the persisted config actually changes.
  const configKey = useMemo(() => JSON.stringify(config), [config]);
  useEffect(() => {
    setDraft(config);
  }, [configKey, config]);

  const setNum = (key: keyof BlankWatchdogConfig, value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    setDraft((d) => ({ ...d, [key]: n }));
  };

  const apply = () => {
    try {
      for (const f of FIELDS) {
        localStorage.setItem(`__phl_watchdog_${f.snake}`, String(draft[f.key]));
      }
      localStorage.setItem("__phl_watchdog_disabled", draft.disabled ? "1" : "0");
      setSavedAt(Date.now());
    } catch {
      /* ignore */
    }
  };

  const reset = () => {
    try {
      for (const f of FIELDS) localStorage.removeItem(`__phl_watchdog_${f.snake}`);
      localStorage.removeItem("__phl_watchdog_disabled");
      setDraft(DEFAULT_BLANK_WATCHDOG_CONFIG);
      setSavedAt(Date.now());
    } catch {
      /* ignore */
    }
  };

  return (
    <details className="mt-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-slate-300">
        Tune at runtime (no redeploy)
      </summary>
      <fieldset className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="sr-only">Blank-watchdog config</legend>
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">{f.label}</span>
            <input
              type="number"
              min={f.min}
              step={f.step}
              value={draft[f.key] as number}
              onChange={(e) => setNum(f.key, e.target.value)}
              className="min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 px-3 text-white"
            />
            <span className="text-xs text-slate-400">{f.help}</span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={draft.disabled}
            onChange={(e) => setDraft((d) => ({ ...d, disabled: e.target.checked }))}
            className="h-5 w-5"
          />
          <span>
            <span className="text-slate-200">Disable watchdog entirely</span>
            <span className="ml-2 text-xs text-slate-400">
              kill-switch — no detection, no fallback overlay
            </span>
          </span>
        </label>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={apply}
          className="min-h-[48px] rounded-lg bg-emerald-500 px-4 font-semibold text-slate-950"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={reset}
          className="min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-900 px-4 font-semibold text-slate-200"
        >
          Reset to defaults
        </button>
        {savedAt ? (
          <span className="text-xs text-emerald-300">
            Saved {new Date(savedAt).toLocaleTimeString()} — reload to apply.
          </span>
        ) : (
          <span className="text-xs text-slate-400">
            Writes <code>__phl_watchdog_*</code> to localStorage. Reload to apply.
          </span>
        )}
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-mono text-slate-100">{value}</dd>
    </>
  );
}

export default BlankWatchdogDiagnosticsPanel;

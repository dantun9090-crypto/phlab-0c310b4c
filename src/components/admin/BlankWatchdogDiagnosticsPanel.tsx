import { useEffect, useState } from "react";
import {
  readBlankWatchdogSnapshot,
  type BlankWatchdogSnapshot,
} from "@/lib/blank-watchdog";

/**
 * In-app diagnostics panel for the blank-page watchdog. Drop into any admin
 * tab — it auto-refreshes every 2s and shows the current paint reason,
 * tick count, escalation attempts, recovery flags and active config so we
 * can debug refresh-loop reports without asking the user for devtools logs.
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
          value={
            snap.lastAttemptAt
              ? new Date(snap.lastAttemptAt).toLocaleTimeString()
              : "—"
          }
        />
        <Row label="Captured" value={new Date(snap.capturedAt).toLocaleTimeString()} />
      </dl>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">
          Active config
        </summary>
        <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-emerald-200">
{JSON.stringify(snap.config, null, 2)}
        </pre>
      </details>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">
          Recovery flags
        </summary>
        <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-200">
{JSON.stringify(snap.recoveryFlags, null, 2)}
        </pre>
      </details>

      <p className="mt-4 text-xs text-slate-400">
        Tune at runtime with{" "}
        <code className="rounded bg-slate-900 px-1 text-emerald-300">
          ?phl_watchdog_fallback_ms=20000
        </code>{" "}
        or{" "}
        <code className="rounded bg-slate-900 px-1 text-emerald-300">
          ?phl_watchdog_disabled=1
        </code>
        . Overrides persist in localStorage and require no redeploy.
      </p>
    </section>
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

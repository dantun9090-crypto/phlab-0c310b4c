/**
 * Admin tab: live blank-page-watchdog diagnostics + browseable snapshot
 * archive. Snapshots are POSTed to /api/public/error-monitor with
 * type='blank_watchdog' whenever the fallback overlay fires; this tab queries
 * Firestore `error_events` and lets an admin inspect the captured DOM HTML
 * and screenshot artefact for each occurrence.
 */
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import BlankWatchdogDiagnosticsPanel from "@/components/admin/BlankWatchdogDiagnosticsPanel";
import { AlertTriangle, ImageOff, RefreshCw, Search } from "lucide-react";

interface BlankWatchdogEvent {
  id: string;
  type: string;
  path?: string;
  message?: string;
  userAgent?: string;
  routeId?: string;
  buildId?: string;
  release?: string;
  details?: Record<string, string | number | boolean | null>;
  htmlSnapshot?: string;
  screenshot?: string;
  createdAt?: Timestamp;
}

export default function BlankWatchdogTab() {
  const [events, setEvents] = useState<BlankWatchdogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "error_events"),
      where("type", "==", "blank_watchdog"),
      orderBy("createdAt", "desc"),
      fbLimit(100),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: BlankWatchdogEvent[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<BlankWatchdogEvent, "id">),
        }));
        setEvents(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.code || err?.message || "Failed to load snapshots");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const s = search.toLowerCase();
    return events.filter((e) =>
      [e.path, e.message, e.userAgent, e.routeId, e.buildId, JSON.stringify(e.details || {})]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [events, search]);

  const selected = events.find((e) => e.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <BlankWatchdogDiagnosticsPanel />

      <section className="rounded-lg border-2 border-slate-600 bg-slate-800 p-4 text-white">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Captured fallback events ({filtered.length})
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search path, UA, build…"
              className="min-h-[40px] w-64 rounded-lg border-2 border-slate-600 bg-slate-900 px-3 text-white"
            />
          </label>
        </header>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : error ? (
          <p className="text-sm text-red-300">Error: {error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400">
            No blank-watchdog fallbacks recorded. Snapshots are uploaded automatically when the
            fallback overlay fires.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <ul className="max-h-[600px] overflow-auto rounded-lg border border-slate-700">
              {filtered.map((ev) => {
                const when = ev.createdAt?.toDate?.() ?? null;
                const isSelected = ev.id === selectedId;
                return (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(ev.id)}
                      className={`block w-full border-b border-slate-700 px-3 py-2 text-left text-sm ${
                        isSelected ? "bg-emerald-500/10" : "hover:bg-slate-700/40"
                      }`}
                    >
                      <div className="font-mono text-xs text-slate-400">
                        {when ? when.toLocaleString() : ev.id}
                      </div>
                      <div className="truncate font-semibold">{ev.path || "(unknown path)"}</div>
                      <div className="truncate text-xs text-slate-400">
                        {ev.details?.reason ? `reason: ${ev.details.reason}` : ev.message || "—"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
              {!selected ? (
                <p className="text-sm text-slate-400">Select an event on the left to inspect.</p>
              ) : (
                <SnapshotDetail event={selected} />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SnapshotDetail({ event }: { event: BlankWatchdogEvent }) {
  return (
    <div className="space-y-4 text-sm">
      <header>
        <h3 className="text-base font-semibold">{event.path || "(unknown path)"}</h3>
        <p className="font-mono text-xs text-slate-400">{event.id}</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-slate-400">When</dt>
        <dd className="font-mono">{event.createdAt?.toDate?.().toLocaleString() ?? "—"}</dd>
        <dt className="text-slate-400">Build</dt>
        <dd className="font-mono">{event.buildId || "—"}</dd>
        <dt className="text-slate-400">Release</dt>
        <dd className="font-mono">{event.release || "—"}</dd>
        <dt className="text-slate-400">Route</dt>
        <dd className="font-mono">{event.routeId || "—"}</dd>
        <dt className="text-slate-400">User-Agent</dt>
        <dd className="col-span-2 truncate font-mono">{event.userAgent || "—"}</dd>
      </dl>

      <section>
        <h4 className="mb-1 text-sm font-semibold text-slate-300">Screenshot</h4>
        {event.screenshot ? (
          <a href={event.screenshot} target="_blank" rel="noopener noreferrer">
            <img
              src={event.screenshot}
              alt="Captured page screenshot"
              className="max-h-[420px] w-full rounded border border-slate-700 object-contain"
            />
          </a>
        ) : (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <ImageOff className="h-4 w-4" /> No screenshot captured (browser may have tainted the
            canvas).
          </p>
        )}
      </section>

      <section>
        <h4 className="mb-1 text-sm font-semibold text-slate-300">Diagnostics payload</h4>
        <pre className="max-h-[180px] overflow-auto rounded bg-slate-950 p-3 text-xs text-emerald-200">
{JSON.stringify(event.details || {}, null, 2)}
        </pre>
      </section>

      {event.htmlSnapshot ? (
        <section>
          <h4 className="mb-1 text-sm font-semibold text-slate-300">DOM snapshot</h4>
          <pre className="max-h-[260px] overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-200">
{event.htmlSnapshot}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

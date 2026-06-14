import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Activity, RefreshCw, AlertCircle, CheckCircle2, XCircle,
  ExternalLink, Clock, Link2,
} from 'lucide-react';

interface UrlCheck {
  url: string;
  kind: 'slug' | 'id';
  productId: string;
  expectedSlug: string;
  finalUrl: string;
  finalStatus: number;
  redirectChain: string[];
  canonical: string | null;
  ok: boolean;
  issues: string[];
}

interface ScanSummary {
  scannedAt: string;
  origin: string;
  totalProducts: number;
  totalChecks: number;
  failedChecks: number;
  durationMs: number;
  checks: UrlCheck[];
}

interface ScanDoc {
  id: string;
  scannedAt: string;
  origin: string;
  totalProducts: number;
  totalChecks: number;
  failedChecks: number;
  durationMs: number;
  failingChecks: UrlCheck[];
}

const ENDPOINT = '/api/public/hooks/monitor-product-urls';

export default function UrlMonitorTab() {
  const [history, setHistory] = useState<ScanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<ScanSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = query(
        collection(db, 'url_monitor_scans'),
        orderBy('scannedAt', 'desc'),
        limit(20),
      );
      const snap = await getDocs(q);
      const docs: ScanDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const ts = data.scannedAt;
        const iso =
          ts && typeof ts.toDate === 'function'
            ? ts.toDate().toISOString()
            : typeof ts === 'string'
              ? ts
              : new Date().toISOString();
        return {
          id: d.id,
          scannedAt: iso,
          origin: data.origin ?? '',
          totalProducts: data.totalProducts ?? 0,
          totalChecks: data.totalChecks ?? 0,
          failedChecks: data.failedChecks ?? 0,
          durationMs: data.durationMs ?? 0,
          failingChecks: Array.isArray(data.failingChecks) ? data.failingChecks : [],
        };
      });
      setHistory(docs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const runScan = async () => {
    setRunning(true);
    setErr(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const json = (await res.json()) as ScanSummary | { error: string; message?: string };
      if (!res.ok || 'error' in json) {
        throw new Error('error' in json ? `${json.error}: ${json.message ?? ''}` : 'scan_failed');
      }
      setLastRun(json);
      await loadHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const latest = history[0];
  const failing = lastRun?.checks.filter((c) => !c.ok) ?? latest?.failingChecks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-400" />
            URL Monitor
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Skanuje publiczne <code className="text-emerald-300">/products/&#123;slug&#125;</code> i{' '}
            <code className="text-emerald-300">/products/&#123;id&#125;</code> i wykrywa, gdy URL produktu
            kończy na <code>/products</code>, <code>/</code> lub innej stronie niż produkt — albo gdy
            URL z ID przekierowuje (powinien renderować w miejscu, kanoniczny → slug).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadHistory()}
            disabled={loading}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-lg border-2 border-slate-600 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Odśwież
          </button>
          <button
            onClick={() => void runScan()}
            disabled={running}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Activity className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Skanuję…' : 'Uruchom skan teraz'}
          </button>
        </div>
      </div>

      {err && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      <div className="p-4 bg-slate-900 border-2 border-slate-700 rounded-lg text-xs text-slate-400">
        <p className="text-slate-300 font-semibold mb-1">Harmonogram (opcjonalnie)</p>
        Wywołaj okresowo z dowolnego cron / uptime monitora (np. UptimeRobot, Cron-job.org, Cloudflare Cron Trigger):
        <br />
        <code className="text-emerald-300">GET https://phlabs.co.uk{ENDPOINT}</code>
        <br />Limit: 6 żądań / min na IP. Każdy skan zapisuje raport do{' '}
        <code className="text-emerald-300">url_monitor_scans</code> w Firestore.
      </div>

      {/* Latest scan summary */}
      {latest && (
        <div className="p-4 bg-slate-900 border-2 border-slate-700 rounded-lg">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Clock className="w-4 h-4 text-slate-500" />
              Ostatni skan: <span className="text-white">{new Date(latest.scannedAt).toLocaleString('pl-PL')}</span>
              <span className="text-slate-500">({latest.durationMs} ms)</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">
                Produkty: <span className="text-white">{latest.totalProducts}</span>
              </span>
              <span className="text-slate-400">
                Sprawdzenia: <span className="text-white">{latest.totalChecks}</span>
              </span>
              {latest.failedChecks === 0 ? (
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Wszystko OK
                </span>
              ) : (
                <span className="px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/30 flex items-center gap-1">
                  <XCircle className="w-4 h-4" /> {latest.failedChecks} błędów
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Failing checks detail */}
      {failing.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            Wykryte problemy ({failing.length})
          </h3>
          <div className="space-y-2">
            {failing.map((c, i) => (
              <div key={i} className="p-3 bg-slate-900 border border-red-500/30 rounded-lg text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-300 hover:underline font-mono text-xs flex items-center gap-1 break-all"
                  >
                    {c.url} <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  <span className="px-2 py-0.5 rounded text-xs bg-slate-800 border border-slate-600 text-slate-300">
                    {c.kind.toUpperCase()} • HTTP {c.finalStatus}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400 space-y-1">
                  <div>
                    <span className="text-slate-500">Final:</span>{' '}
                    <span className="text-white font-mono">{c.finalUrl}</span>
                  </div>
                  {c.redirectChain.length > 0 && (
                    <div className="flex items-start gap-1">
                      <Link2 className="w-3 h-3 mt-0.5 text-amber-400" />
                      <span className="text-amber-300 font-mono break-all">
                        {c.redirectChain.join(' → ')}
                      </span>
                    </div>
                  )}
                  {c.canonical && (
                    <div>
                      <span className="text-slate-500">Canonical:</span>{' '}
                      <span className="text-white font-mono">{c.canonical}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.issues.map((issue, j) => (
                      <span
                        key={j}
                        className="px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30 font-mono text-xs"
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="text-white font-semibold mb-2">Historia skanów</h3>
        {loading ? (
          <p className="text-slate-400 text-sm">Ładuję…</p>
        ) : history.length === 0 ? (
          <p className="text-slate-400 text-sm">
            Brak skanów. Uruchom pierwszy skan przyciskiem powyżej.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Produkty</th>
                  <th className="py-2 pr-4">Sprawdzeń</th>
                  <th className="py-2 pr-4">Błędy</th>
                  <th className="py-2 pr-4">Czas</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-white">
                      {new Date(h.scannedAt).toLocaleString('pl-PL')}
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{h.totalProducts}</td>
                    <td className="py-2 pr-4 text-slate-300">{h.totalChecks}</td>
                    <td className="py-2 pr-4">
                      {h.failedChecks === 0 ? (
                        <span className="text-emerald-300">0</span>
                      ) : (
                        <span className="text-red-300 font-semibold">{h.failedChecks}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{h.durationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

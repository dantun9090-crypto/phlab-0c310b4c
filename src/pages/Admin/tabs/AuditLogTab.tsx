import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { db, collection, getDocs, query, orderBy, limit } from '@/lib/firebase';
import { validateContent, type ComplianceResult } from '@/lib/peptide-compliance';

interface AuditEntry {
  id: string;
  adminUid?: string;
  adminEmail?: string | null;
  action?: string;
  target?: string;
  before?: any;
  after?: any;
  timestamp?: any;
}

export default function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  // Compliance content scan
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<
    { id: string; name: string; result: ComplianceResult }[]
  >([]);

  async function loadAuditLog() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(200))
      );
      setEntries(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch (err: any) {
      console.error('[audit] load failed', err);
    } finally {
      setLoading(false);
    }
  }

  async function runComplianceScan() {
    setScanning(true);
    setScanResults([]);
    try {
      const snap = await getDocs(collection(db, 'products'));
      const found: { id: string; name: string; result: ComplianceResult }[] = [];
      snap.forEach(d => {
        const data: any = d.data();
        const text = [data.description, data.shortDescription, data.seoDescription]
          .filter(Boolean)
          .join('\n\n');
        const result = validateContent(text);
        if (!result.valid) {
          found.push({ id: d.id, name: data.name || d.id, result });
        }
      });
      setScanResults(found);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => { loadAuditLog(); }, []);

  const filtered = entries.filter(e => {
    if (!filter) return true;
    const hay = `${e.action} ${e.target} ${e.adminEmail}`.toLowerCase();
    return hay.includes(filter.toLowerCase());
  });

  return (
    <div className="p-4 lg:p-8 space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">Security &amp; Audit</h1>
        </div>
        <p className="text-slate-400">
          Privileged admin actions and UK research-peptide content compliance.
        </p>
      </div>

      {/* === Audit log === */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-white">Admin audit log</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by action, target, email…"
                className="bg-slate-800 border-2 border-slate-600 text-white rounded-lg pl-9 pr-3 min-h-[40px] text-sm"
              />
            </div>
            <button
              onClick={loadAuditLog}
              className="inline-flex items-center gap-1 px-3 min-h-[40px] bg-slate-800 border-2 border-slate-600 text-white rounded-lg text-sm hover:bg-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-400 text-sm">No audit entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Admin</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const ts = e.timestamp?.toDate?.() ?? null;
                  return (
                    <tr key={e.id} className="border-b border-slate-800/60">
                      <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">
                        {ts ? ts.toLocaleString('en-GB') : '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-300">{e.adminEmail || e.adminUid || '—'}</td>
                      <td className="py-2 pr-3 text-emerald-400 font-mono">{e.action}</td>
                      <td className="py-2 pr-3 text-slate-300 font-mono">{e.target}</td>
                      <td className="py-2 pr-3 text-slate-400">
                        {e.before || e.after ? (
                          <code className="text-xs">
                            {e.before ? `was: ${JSON.stringify(e.before)} ` : ''}
                            {e.after ? `now: ${JSON.stringify(e.after)}` : ''}
                          </code>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* === Compliance content scan === */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">UK regulatory content scan</h2>
            <p className="text-slate-400 text-sm mt-1">
              Flags forbidden medical claims (treat, cure, prescription, weight loss…) in product descriptions.
            </p>
          </div>
          <button
            onClick={runComplianceScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>
        </div>

        {scanResults.length === 0 && !scanning ? (
          <div className="text-slate-400 text-sm">No issues found yet. Run a scan to check.</div>
        ) : (
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            {scanResults.map(r => (
              <li
                key={r.id}
                className="border border-amber-700/50 bg-amber-900/10 rounded-lg p-3 text-sm"
              >
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  {r.name}
                </div>
                <ul className="mt-1 text-amber-200/80 list-disc list-inside">
                  {r.result.violations.map((v, i) => (
                    <li key={i}>
                      <code className="font-mono">{v.match}</code> — {v.reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </motion.ul>
        )}
      </section>
    </div>
  );
}

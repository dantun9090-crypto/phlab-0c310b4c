import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface EventRow {
  id: string;
  level?: string;
  message?: string;
  ctx?: Record<string, unknown>;
  createdAt?: any;
}

export default function FenaTab() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db, 'fena_webhook_events'),
          orderBy('createdAt', 'desc'),
          limit(50),
        );
        const snap = await getDocs(q);
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      } catch (e: any) {
        setErr(e?.message || 'Failed to load events');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Fena Payments</h1>
        <p className="text-sm text-slate-400 mt-1">
          Open Banking integration. Webhook URL:{' '}
          <code className="text-emerald-400">https://phlabs.co.uk/api/public/hooks/fena</code>
        </p>
        <p className="text-sm text-slate-400">
          Customer redirect URL:{' '}
          <code className="text-emerald-400">https://phlabs.co.uk/payment/success</code>
        </p>
      </div>

      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Recent webhook events</h2>
        {loading && <p className="text-slate-400 text-sm">Loading…</p>}
        {err && <p className="text-rose-400 text-sm">{err}</p>}
        {!loading && !err && rows.length === 0 && (
          <p className="text-slate-400 text-sm">
            No events yet. Once Fena POSTs to the webhook, entries will appear here.
          </p>
        )}
        {!loading && rows.length > 0 && (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded border border-slate-800 bg-slate-950 p-3 text-xs font-mono text-slate-300"
              >
                <div className="flex gap-3 mb-1">
                  <span
                    className={
                      r.level === 'error'
                        ? 'text-rose-400'
                        : r.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }
                  >
                    {r.level || 'info'}
                  </span>
                  <span className="text-slate-500">
                    {r.createdAt?.toDate?.()?.toISOString?.() || ''}
                  </span>
                  <span className="text-white">{r.message}</span>
                </div>
                {r.ctx && (
                  <pre className="text-slate-400 whitespace-pre-wrap break-all">
                    {JSON.stringify(r.ctx, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { listFenaWebhookEvents, type FenaWebhookEventRow } from '@/lib/fena.functions';

type EventRow = FenaWebhookEventRow;

export default function FenaTab() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error('Not signed in');
        const events = await listFenaWebhookEvents({ data: { idToken } });
        setRows(events);
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
                    {r.createdAt || ''}
                  </span>
                  <span className="text-white">{r.message}</span>
                </div>
                {r.ctx && (
                  <pre className="text-slate-400 whitespace-pre-wrap break-all">
                    {r.ctx}
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

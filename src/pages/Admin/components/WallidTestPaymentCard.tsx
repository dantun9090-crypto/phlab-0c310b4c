/**
 * Admin-only "Test £1 payment" card for the Payment Gateways tab.
 *
 * Clicking the button creates a real £1 Wallid Pay-by-Bank session via
 * `createWallidTestPayment` and opens the resulting hosted-payment-page in
 * a new tab so the admin can walk through the live flow.
 */
import { useState } from 'react';
import { Loader2, ExternalLink, FlaskConical, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminIdToken } from '@/lib/auth-ready';
import { createWallidTestPayment } from '@/lib/wallid-test-payment.functions';

type Last = { orderId: string; paymentLink: string; apiPaymentId: string; at: number };

export default function WallidTestPaymentCard() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [last, setLast] = useState<Last | null>(null);

  async function run() {
    setBusy(true);
    setErr('');
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const r = await createWallidTestPayment({ data: { idToken } });
      const next: Last = {
        orderId: r.orderId,
        paymentLink: r.paymentLink,
        apiPaymentId: r.apiPaymentId,
        at: Date.now(),
      };
      setLast(next);
      toast.success('Test £1 payment created — opening Wallid…');
      try {
        window.open(r.paymentLink, '_blank', 'noopener,noreferrer');
      } catch {
        /* popup blocked — link is still shown below */
      }
    } catch (e: any) {
      const msg = e?.message || 'Failed to create test payment';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-amber-400" />
            Test £1 Wallid payment
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Creates a real £1 Pay-by-Bank session against the live Wallid API and opens the hosted payment page in a new tab.
            Use to verify the full bank flow end-to-end. Order id is prefixed <code className="text-emerald-400">TEST-</code> so
            it is easy to spot in logs and the <code className="text-emerald-400">wallid_payments</code> table.
          </p>
        </div>
      </div>

      {err && (
        <div className="rounded border border-red-700 bg-red-950/40 p-2 text-xs text-red-200">{err}</div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold px-4 min-h-[40px] inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
          {busy ? 'Creating…' : 'Run £1 test payment'}
        </button>

        {last && (
          <span className="text-xs text-slate-400 inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Last: <code className="text-emerald-400">{last.orderId}</code>
          </span>
        )}
      </div>

      {last && (
        <div className="rounded border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-300 space-y-1">
          <div className="flex justify-between gap-3">
            <span className="text-slate-400 uppercase tracking-wider">Order id</span>
            <code className="text-emerald-400">{last.orderId}</code>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400 uppercase tracking-wider">Wallid payment id</span>
            <code className="text-emerald-400 break-all text-right">{last.apiPaymentId}</code>
          </div>
          <a
            href={last.paymentLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold pt-1"
          >
            Open payment page <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}

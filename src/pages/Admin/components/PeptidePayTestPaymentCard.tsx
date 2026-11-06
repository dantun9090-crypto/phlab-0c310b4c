/**
 * Admin-only "Test payment" card for PeptidePay (card / Apple Pay /
 * Google Pay / crypto).
 *
 * Creates a real hosted checkout session via `createPeptidePayTestPayment`
 * and opens it in a new tab. Abandon the hosted page to test only the
 * redirect; complete it to verify webhook settlement end-to-end.
 */
import { useState } from 'react';
import { Loader2, ExternalLink, CreditCard, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminIdToken } from '@/lib/auth-ready';
import { createPeptidePayTestPayment } from '@/lib/peptidepay-test-payment.functions';

interface Last {
  orderId: string;
  sessionId: string;
  url: string;
  status: string;
  amountGbp: number;
}

export default function PeptidePayTestPaymentCard() {
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('1.00');
  const [err, setErr] = useState('');
  const [last, setLast] = useState<Last | null>(null);

  async function run() {
    setBusy(true);
    setErr('');
    try {
      const pence = Math.round(parseFloat(amount || '1') * 100);
      if (!Number.isFinite(pence) || pence < 100 || pence > 5000) {
        throw new Error('Amount must be between £1.00 and £50.00');
      }
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const r = await createPeptidePayTestPayment({ data: { idToken, amountPence: pence } });
      setLast({
        orderId: r.orderId,
        sessionId: r.sessionId,
        url: r.url,
        status: r.status,
        amountGbp: r.amountGbp,
      });
      toast.success('PeptidePay test session created — opening checkout…');
      try {
        window.open(r.url, '_blank', 'noopener,noreferrer');
      } catch {
        /* popup blocked — link is shown below */
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create test payment';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-emerald-400" />
          Test PeptidePay payment
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Creates a real hosted PeptidePay checkout session (card / Apple Pay / Google Pay / crypto)
          and opens it in a new tab. There is no sandbox — abandon the page to test the redirect only,
          or complete it to verify webhook settlement. Order id is prefixed{' '}
          <code className="text-emerald-400">TEST-</code>.
        </p>
      </div>

      {err && (
        <div className="rounded border border-red-700 bg-red-950/40 p-2 text-xs text-red-200">{err}</div>
      )}

      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs text-slate-400 uppercase tracking-wider">
          Amount (£)
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 block w-28 rounded-lg border-2 border-slate-600 bg-slate-800 text-white text-sm px-3 min-h-[48px]"
          />
        </label>

        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold px-4 min-h-[48px] inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {busy ? 'Creating…' : 'Run test payment'}
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
            <span className="text-slate-400 uppercase tracking-wider">Amount</span>
            <code className="text-emerald-400">£{last.amountGbp.toFixed(2)}</code>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400 uppercase tracking-wider">Session id</span>
            <code className="text-emerald-400 break-all text-right">{last.sessionId}</code>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400 uppercase tracking-wider">Status</span>
            <code className="text-emerald-400">{last.status}</code>
          </div>
          <a
            href={last.url}
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

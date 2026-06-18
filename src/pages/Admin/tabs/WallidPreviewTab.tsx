/**
 * Admin-only Wallid Pay-by-Bank checkout simulator.
 *
 * Two stages:
 *  1. Merchant checkout (PH Labs) — shows the Pay by Bank tile + trust badge
 *     exactly as the customer sees BEFORE redirect.
 *  2. Wallid hosted flow (mock) — bank picker → bank app handoff → consent
 *     → success → return to merchant. No real API calls.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, Copy, Landmark, CreditCard, ArrowLeft, ShieldCheck,
  Search, Loader2, Lock, ExternalLink,
} from 'lucide-react';
import WallidTrustElements from '@/components/WallidTrustElements';
import { WALLID_BANK_CATALOG, BankMark, type WallidBankDef } from '@/lib/wallid-bank-catalog';

type Method = 'stripe' | 'manual' | 'wallid';
type Stage =
  | 'merchant'        // PH Labs checkout
  | 'wallid-banks'    // Wallid hosted bank picker
  | 'wallid-redirect' // "Opening your bank..."
  | 'bank-login'      // Mock bank login screen
  | 'bank-consent'    // Mock bank "approve payment" screen
  | 'wallid-success'  // Wallid success then auto-return
  | 'merchant-success'; // Back on PH Labs

const SNIPPET = `{paymentMethod === 'wallid' && <WallidTrustElements />}`;
const AMOUNT = 29.99;
const REF = `PH-${Math.floor(Math.random() * 9000 + 1000)}`;

export default function WallidPreviewTab() {
  const [stage, setStage] = useState<Stage>('merchant');
  const [method, setMethod] = useState<Method>('wallid');
  const [showBadges, setShowBadges] = useState(true);
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState<WallidBankDef | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WALLID_BANK_CATALOG;
    return WALLID_BANK_CATALOG.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.id.includes(q) ||
        b.keywords?.some((k) => k.includes(q)),
    );
  }, [query]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      toast.success('Snippet copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const startPay = () => {
    if (method !== 'wallid') {
      setStage('merchant-success');
      return;
    }
    setStage('wallid-banks');
  };

  const pickBank = (b: WallidBankDef) => {
    setBank(b);
    setStage('wallid-redirect');
    setTimeout(() => setStage('bank-login'), 1200);
  };

  const reset = () => {
    setStage('merchant');
    setBank(null);
    setQuery('');
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-white">Wallid Preview</h1>
        <p className="text-sm text-slate-400 mt-1">
          Full Pay-by-Bank flow simulator — checkout → Wallid hosted page →
          bank app → return. No real API calls.
        </p>
      </header>

      {stage === 'merchant' && (
        <MerchantStage
          method={method}
          setMethod={setMethod}
          showBadges={showBadges}
          setShowBadges={setShowBadges}
          onPay={startPay}
          onCopy={copy}
        />
      )}

      {stage === 'wallid-banks' && (
        <WallidShell title="Choose your bank" onBack={() => setStage('merchant')}>
          <div className="px-4 pt-3 pb-2 bg-white sticky top-0 z-10 border-b border-slate-200">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your bank…"
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border-2 border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="p-4 grid grid-cols-3 gap-3 max-h-[420px] overflow-y-auto">
            {filtered.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => pickBank(b)}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm transition"
              >
                <BankMark bank={b} size={44} />
                <span className="text-[10px] font-medium text-slate-700 text-center leading-tight line-clamp-2">
                  {b.name}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-3 text-center text-xs text-slate-500 py-8">
                No banks match "{query}"
              </p>
            )}
          </div>
        </WallidShell>
      )}

      {stage === 'wallid-redirect' && bank && (
        <WallidShell title="Connecting…">
          <div className="p-8 flex flex-col items-center text-center gap-4">
            <BankMark bank={bank} size={64} />
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-sm font-semibold text-slate-900">
              Opening {bank.name}…
            </p>
            <p className="text-xs text-slate-500">
              You'll be redirected to your bank's secure app to approve £{AMOUNT.toFixed(2)}.
            </p>
          </div>
        </WallidShell>
      )}

      {stage === 'bank-login' && bank && (
        <BankShell bank={bank} step="login">
          <div className="space-y-3">
            <p className="text-sm text-white/80">Log in to approve payment</p>
            <input
              placeholder="Customer ID"
              className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder-white/50 focus:outline-none focus:border-white/40"
              defaultValue="••••••••"
            />
            <input
              placeholder="Password"
              type="password"
              className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder-white/50 focus:outline-none focus:border-white/40"
              defaultValue="••••••••"
            />
            <button
              type="button"
              onClick={() => setStage('bank-consent')}
              className="w-full mt-1 bg-white text-slate-900 font-bold py-2.5 rounded-lg hover:bg-slate-100"
            >
              Continue
            </button>
            <p className="text-[10px] text-white/60 text-center flex items-center justify-center gap-1">
              <Lock className="w-3 h-3" /> Secured by {bank.name}
            </p>
          </div>
        </BankShell>
      )}

      {stage === 'bank-consent' && bank && (
        <BankShell bank={bank} step="consent">
          <div className="space-y-3">
            <p className="text-sm font-bold text-white">Approve payment</p>
            <div className="bg-white/10 rounded-lg p-3 space-y-1.5 border border-white/15">
              <Row label="To" value="PH Labs" />
              <Row label="Amount" value={`£${AMOUNT.toFixed(2)}`} bold />
              <Row label="Reference" value={REF} />
              <Row label="From" value={`${bank.name} •• 4421`} />
            </div>
            <p className="text-[11px] text-white/70 leading-snug">
              By approving, you authorise a one-off payment from your account.
              No future payments will be taken.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStage('merchant')}
                className="py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/15"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage('wallid-success');
                  setTimeout(() => setStage('merchant-success'), 1500);
                }}
                className="py-2.5 rounded-lg bg-emerald-400 text-slate-900 text-sm font-bold hover:bg-emerald-300"
              >
                Approve £{AMOUNT.toFixed(2)}
              </button>
            </div>
          </div>
        </BankShell>
      )}

      {stage === 'wallid-success' && (
        <WallidShell title="Payment approved">
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            <p className="text-base font-bold text-slate-900">Payment received</p>
            <p className="text-xs text-slate-500">
              Returning you to PH Labs…
            </p>
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin mt-2" />
          </div>
        </WallidShell>
      )}

      {stage === 'merchant-success' && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Order confirmed</h2>
          <p className="text-xs text-slate-400">
            #{REF} — £{AMOUNT.toFixed(2)} via{' '}
            {method === 'wallid'
              ? `Pay by Bank (${bank?.name ?? 'Wallid'})`
              : method === 'stripe' ? 'Stripe' : 'Manual Transfer'}.
          </p>
          <button
            type="button"
            onClick={reset}
            className="w-full mt-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold py-2.5 rounded-lg"
          >
            Run simulation again
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Sub-views ─────────────── */

function MerchantStage(props: {
  method: Method;
  setMethod: (m: Method) => void;
  showBadges: boolean;
  setShowBadges: (v: boolean) => void;
  onPay: () => void;
  onCopy: () => void;
}) {
  const { method, setMethod, showBadges, setShowBadges, onPay, onCopy } = props;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-slate-300 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
          <input
            type="checkbox"
            checked={showBadges}
            onChange={(e) => setShowBadges(e.target.checked)}
            className="accent-emerald-500"
          />
          Show trust badge
        </label>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2"
        >
          <Copy className="w-3.5 h-3.5" /> Copy snippet
        </button>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          Stage 1 of 2 — PH Labs checkout
        </span>
      </div>

      <div className="bg-[#0a1426] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <p className="text-sm font-semibold text-white">GHK-Cu 50mg</p>
            <p className="text-[11px] text-gray-400">Research Peptide</p>
          </div>
          <p className="text-lg font-bold text-emerald-400">£{AMOUNT.toFixed(2)}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-300">Payment method</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { id: 'stripe', label: 'Card (Stripe)', icon: CreditCard },
              { id: 'manual', label: 'Manual Transfer', icon: Landmark },
              { id: 'wallid', label: 'Pay by Bank',     icon: Landmark },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMethod(id)}
                className={`flex items-center gap-2 text-left p-3 rounded-xl border transition-all ${
                  method === id
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-white/10 bg-[#060f1e] hover:border-white/20'
                }`}
              >
                <Icon className={`w-4 h-4 ${method === id ? 'text-emerald-400' : 'text-gray-400'}`} />
                <span className="text-xs font-semibold text-white">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {method === 'wallid' && showBadges && <WallidTrustElements />}

        <button
          type="button"
          onClick={onPay}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {method === 'wallid' ? (
            <>Continue to Bank <ExternalLink className="w-4 h-4" /></>
          ) : (
            <>Pay £{AMOUNT.toFixed(2)}</>
          )}
        </button>

        {method === 'wallid' && (
          <p className="text-[10px] text-slate-500 text-center -mt-2">
            You'll be redirected to Wallid's secure page to choose your bank.
          </p>
        )}
      </div>
    </>
  );
}

function WallidShell(props: {
  title: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 px-1">
        Stage 2 — wallid.io (hosted)
      </p>
      <div className="rounded-2xl overflow-hidden border border-slate-300 bg-white shadow-2xl max-w-md mx-auto">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
          {props.onBack ? (
            <button
              type="button"
              onClick={props.onBack}
              className="text-slate-500 hover:text-slate-900"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-500 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> wallid.io
            </p>
            <p className="text-xs font-semibold text-slate-900 truncate">{props.title}</p>
          </div>
          <span className="text-[10px] font-bold text-emerald-600">£{AMOUNT.toFixed(2)}</span>
        </div>
        {props.children}
      </div>
    </div>
  );
}

function BankShell(props: {
  bank: WallidBankDef;
  step: 'login' | 'consent';
  children: React.ReactNode;
}) {
  const { bank } = props;
  const bg = bank.accent
    ? `linear-gradient(140deg, ${bank.color} 0%, ${bank.accent} 100%)`
    : bank.color;
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 px-1">
        Stage 3 — {bank.name} app (mock)
      </p>
      <div
        className="rounded-2xl overflow-hidden border border-slate-700 shadow-2xl max-w-md mx-auto"
        style={{ background: bg }}
      >
        <div className="px-4 py-3 flex items-center gap-2 border-b border-white/15">
          <BankMark bank={bank} size={28} />
          <p className="text-xs font-bold text-white flex-1">{bank.name}</p>
          <Lock className="w-3 h-3 text-white/70" />
        </div>
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-white/60">{label}</span>
      <span className={`text-white ${bold ? 'font-bold text-sm' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

/**
 * Admin-only Wallid Pay-by-Bank checkout simulator.
 *
 * Mounts at Admin → "Wallid Preview" so the team can see exactly what a
 * customer sees when they select the Wallid tile on checkout — trust
 * badges, UK bank icon grid, copy and the success modal — without making
 * any real API calls. Behind the admin auth route like every other tab.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Landmark, CreditCard } from 'lucide-react';
import WallidTrustElements from '@/components/WallidTrustElements';

type Method = 'stripe' | 'manual' | 'wallid';

const SNIPPET = `{/* Drop into your checkout when Pay by Bank is selected */}
import WallidTrustElements from '@/components/WallidTrustElements';

{paymentMethod === 'wallid' && <WallidTrustElements />}`;

export default function WallidPreviewTab() {
  const [method, setMethod] = useState<Method>('wallid');
  const [showBadges, setShowBadges] = useState(true);
  const [success, setSuccess] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      toast.success('Component snippet copied');
    } catch {
      toast.error('Copy failed — clipboard blocked');
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-white">Wallid Preview</h1>
        <p className="text-sm text-slate-400 mt-1">
          Customer checkout simulator — no real API calls. Toggle methods to
          preview the live experience.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-slate-300 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
          <input
            type="checkbox"
            checked={showBadges}
            onChange={(e) => setShowBadges(e.target.checked)}
            className="accent-emerald-500"
          />
          Show trust badges
        </label>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2"
        >
          <Copy className="w-3.5 h-3.5" /> Copy Component Code
        </button>
      </div>

      {/* Mock checkout card */}
      <div className="bg-[#0a1426] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <p className="text-sm font-semibold text-white">GHK-Cu 50mg</p>
            <p className="text-[11px] text-gray-400">Research Peptide</p>
          </div>
          <p className="text-lg font-bold text-emerald-400">£29.99</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-300">Payment method</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { id: 'stripe',  label: 'Card (Stripe)',   icon: CreditCard },
              { id: 'manual',  label: 'Manual Transfer', icon: Landmark },
              { id: 'wallid',  label: 'Pay by Bank',     icon: Landmark },
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

        {method === 'wallid' && <WallidTrustElements showBadges={showBadges} />}

        <button
          type="button"
          onClick={() => setSuccess(true)}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl transition-colors"
        >
          Simulate Payment — £29.99
        </button>
      </div>

      {success && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSuccess(false)}
        >
          <div
            className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 max-w-sm w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white">Payment confirmed</h2>
            <p className="text-xs text-slate-400 mt-1">
              Mock order #PH-TEST-{Math.floor(Math.random() * 9000 + 1000)} —
              £29.99 via {method === 'wallid' ? 'Pay by Bank' : method === 'stripe' ? 'Stripe' : 'Manual Transfer'}.
            </p>
            <button
              type="button"
              onClick={() => setSuccess(false)}
              className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold py-2 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

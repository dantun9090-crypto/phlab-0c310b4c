/**
 * Wallid Pay-by-Bank admin kill switch.
 *
 * Renders inside the existing Payment Gateways tab as a separate card.
 * Toggles `app_config.wallid_enabled` via `wallid-admin.functions.ts`.
 * When OFF, the checkout hides the Wallid tile and `/api/payments/create`
 * returns 403.
 */
import { useEffect, useState } from 'react';
import { Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  getWallidEnabledAdmin,
  setWallidEnabledAdmin,
} from '@/lib/wallid-admin.functions';

export default function WallidKillSwitchCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const r = await getWallidEnabledAdmin({ data: { idToken } });
      setEnabled(r.enabled);
      setPending(r.enabled);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load Wallid status');
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (enabled === null) return;
    setSaving(true);
    setErr('');
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const r = await setWallidEnabledAdmin({ data: { idToken, enabled: pending } });
      setEnabled(r.enabled);
      toast.success(`Wallid payments ${r.enabled ? 'enabled' : 'disabled'}`);
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
      toast.error('Failed to update Wallid setting');
    } finally {
      setSaving(false);
    }
  }

  const dirty = enabled !== null && enabled !== pending;
  const statusOn = pending === true;

  return (
    <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Power className="w-4 h-4 text-emerald-400" />
            Wallid Pay-by-Bank
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Master kill switch. When OFF the Wallid tile is hidden at checkout and the create-payment API returns 403.
            Guest checkout now uses a one-time server-minted payment token if anonymous sign-in is unavailable; existing pending payments still accept webhooks.
          </p>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded font-semibold ${
            enabled === null
              ? 'bg-slate-700 text-slate-300'
              : enabled
                ? 'bg-emerald-600 text-emerald-50'
                : 'bg-slate-700 text-slate-300'
          }`}
        >
          {enabled === null ? '...' : enabled ? 'ON' : 'OFF'}
        </span>
      </div>

      {err && (
        <div className="rounded border border-red-700 bg-red-950/40 p-2 text-xs text-red-200">{err}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPending((p) => !p)}
          disabled={enabled === null || saving}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            statusOn ? 'bg-emerald-600' : 'bg-slate-600'
          } disabled:opacity-50`}
          aria-pressed={statusOn}
          aria-label="Toggle Wallid Pay-by-Bank"
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              statusOn ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-slate-200">
          Wallid Pay-by-Bank is{' '}
          <strong className={statusOn ? 'text-emerald-400' : 'text-slate-400'}>
            {statusOn ? 'enabled' : 'disabled'}
          </strong>
        </span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-sm font-semibold px-4 py-2 min-h-[40px] inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

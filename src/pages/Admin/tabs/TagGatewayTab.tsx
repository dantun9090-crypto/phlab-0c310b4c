/**
 * Google Tag Gateway (Ads) admin tab.
 *
 * Surfaces the Cloudflare zone-level Google tag gateway config so ads
 * measurement runs first-party from https://phlabs.co.uk/metrics, plus a
 * live probe of the measurement path and toggles for:
 *   - gateway on/off
 *   - IP cloaking (hideOriginalIp) — masks the visitor IP before the beacon
 *     is proxied to Google. This is IP masking only, NOT content cloaking.
 */
import { useCallback, useEffect, useState } from 'react';
import { Cloud, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { logAdminAction } from '@/lib/admin-audit';
import {
  getTagGatewayStatus,
  updateTagGatewayConfig,
  type TagGatewayStatus,
} from '@/lib/tag-gateway.functions';

function StatCard({ label, value, ok }: { label: string; value: string; ok: boolean | null }) {
  const cls =
    ok === null
      ? 'border-slate-600 bg-slate-800'
      : ok
        ? 'border-emerald-500/60 bg-emerald-500/10'
        : 'border-red-500/60 bg-red-500/10';
  return (
    <div className={`p-4 rounded-lg border-2 ${cls}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-base font-mono text-white mt-1 break-all">{value}</div>
    </div>
  );
}

export default function TagGatewayTab() {
  const [data, setData] = useState<TagGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const withToken = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) throw new Error('Sign in as admin first');
    return u.getIdToken();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const idToken = await withToken();
      setData(await getTagGatewayStatus({ data: { idToken } }));
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Load failed' });
    } finally {
      setLoading(false);
    }
  }, [withToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: { enabled: boolean; hideOriginalIp: boolean }) => {
    const before = data?.config ?? null;
    setSaving(true);
    setToast(null);
    try {
      const idToken = await withToken();
      const res = await updateTagGatewayConfig({ data: { idToken, ...next } });
      setData(res);
      if (!res.ok) throw new Error(res.error ?? 'Cloudflare rejected the update');
      await logAdminAction({
        action: 'settings.update',
        target: 'cloudflare/google-tag-gateway',
        before,
        after: res.config,
        meta: { zone: 'phlabs.co.uk' },
      });
      setToast({ ok: true, msg: 'Tag Gateway configuration saved' });
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const cfg = data?.config;

  return (
    <div className="space-y-6">
      {toast && (
        <div
          role="status"
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg border-2 text-sm text-white shadow-xl ${
            toast.ok ? 'border-emerald-500 bg-emerald-600/90' : 'border-red-500 bg-red-600/90'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-emerald-400" />
            Google Tag Gateway (Ads)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            First-party measurement for Google Ads &amp; Analytics, served from your own domain
            via Cloudflare.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="min-h-[48px] px-4 rounded-lg border-2 border-slate-600 bg-slate-800 text-white text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {data && !data.ok && (
        <div className="p-4 rounded-lg border-2 border-red-500/60 bg-red-500/10 text-sm text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{data.error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Gateway"
          value={cfg ? (cfg.enabled ? 'enabled' : 'disabled') : '—'}
          ok={cfg ? cfg.enabled : null}
        />
        <StatCard label="Measurement path" value={cfg?.endpoint ?? '—'} ok={cfg ? true : null} />
        <StatCard label="Measurement ID" value={cfg?.measurementId ?? '—'} ok={cfg?.measurementId ? true : null} />
        <StatCard
          label="IP cloaking (hide visitor IP)"
          value={cfg ? (cfg.hideOriginalIp ? 'on' : 'off') : '—'}
          ok={cfg ? cfg.hideOriginalIp : null}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Probe: /gtag/js"
          value={data ? `${data.probe.scriptStatus ?? 'ERR'}${data.probe.scriptBytes ? ` · ${Math.round(data.probe.scriptBytes / 1024)} KB` : ''}` : '—'}
          ok={data ? data.probe.scriptStatus === 200 : null}
        />
        <StatCard
          label="Probe: /g/collect"
          value={data ? String(data.probe.collectStatus ?? 'ERR') : '—'}
          ok={data ? data.probe.collectStatus !== null && data.probe.collectStatus < 400 : null}
        />
        <StatCard label="Checked at" value={data ? new Date(data.checkedAt).toLocaleTimeString('en-GB') : '—'} ok={null} />
      </div>

      <div className="p-5 rounded-lg border-2 border-slate-600 bg-slate-800 space-y-5">
        <h3 className="text-white font-semibold">Configuration</h3>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 w-5 h-5 accent-emerald-500"
            checked={!!cfg?.enabled}
            disabled={!cfg || saving}
            onChange={(e) => void save({ enabled: e.target.checked, hideOriginalIp: !!cfg?.hideOriginalIp })}
          />
          <span className="text-sm text-slate-200">
            <span className="block text-white font-medium">Enable Tag Gateway</span>
            Serves Google tag scripts and beacons from <code>{cfg?.endpoint ?? '/metrics'}</code> on
            your domain — improves conversion signal recovery for Google Ads.
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 w-5 h-5 accent-emerald-500"
            checked={!!cfg?.hideOriginalIp}
            disabled={!cfg || saving}
            onChange={(e) => void save({ enabled: !!cfg?.enabled, hideOriginalIp: e.target.checked })}
          />
          <span className="text-sm text-slate-200">
            <span className="block text-white font-medium">IP cloaking — hide visitor IP from Google</span>
            Cloudflare strips the original visitor IP before proxying the measurement request.
            Privacy-friendly; may slightly reduce geo granularity in reports.
          </span>
        </label>

        <div className="p-3 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
          <span>
            This is IP masking only. Serving different content to crawlers than to users
            (content cloaking) breaches Google Ads and Search policy and is not available here.
            Every change is written to <code>/auditLogs</code>.
          </span>
        </div>
      </div>
    </div>
  );
}

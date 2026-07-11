import { useEffect, useState } from 'react';

/**
 * Cloudflare Status admin tab — checks presence of purge-related secrets
 * (`CF_API_TOKEN`, `CF_ZONE_ID`, `CF_ZONE_ID_PROHEALTH`) and shows the
 * last purge + verify result from the post-publish invalidation audit.
 *
 * Data source: `/api/public/cloudflare-secrets-status` (presence-only —
 * secret values are NEVER returned). Auto-refreshes every 30s.
 */

interface SecretStatus {
  present: boolean;
  source: string | null;
  length: number;
}

interface CfStatus {
  checkedAt: string;
  secrets: {
    CF_API_TOKEN: SecretStatus;
    CF_ZONE_ID: SecretStatus;
    CF_ZONE_ID_PROHEALTH: SecretStatus;
  };
  lastPurge: {
    requested: boolean;
    ok: boolean | null;
    status: number | null;
    zone: string | null;
    detail: string | null;
    buildId: string | null;
    at: string | null;
  };
  lastVerify: {
    requested: boolean;
    ok: boolean | null;
    hits: number | null;
    misses: number | null;
  };
}

function SecretCard({ label, s }: { label: string; s: SecretStatus }) {
  const ok = s.present;
  const cls = ok
    ? 'border-emerald-500/60 bg-emerald-500/10'
    : 'border-red-500/60 bg-red-500/10';
  return (
    <div className={`p-4 rounded-lg border-2 ${cls}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-base font-mono text-white mt-1">
        {ok ? '✓ configured' : '✗ MISSING'}
      </div>
      <div className="text-xs text-slate-400 mt-1">
        {ok ? `source: ${s.source} · length: ${s.length}` : 'purge will be skipped'}
      </div>
    </div>
  );
}

export default function CloudflareStatusTab() {
  const [data, setData] = useState<CfStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/public/cloudflare-secrets-status', {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as CfStatus;
        if (!cancelled) {
          setData(body);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading) return <div className="p-6 text-slate-300">Loading Cloudflare status…</div>;
  if (error) return <div className="p-6 text-red-400">Failed to load: {error}</div>;
  if (!data) return null;

  const allSecrets =
    data.secrets.CF_API_TOKEN.present &&
    data.secrets.CF_ZONE_ID.present &&
    data.secrets.CF_ZONE_ID_PROHEALTH.present;

  const purge = data.lastPurge;
  const verify = data.lastVerify;
  const purgeCls =
    purge.ok === true
      ? 'border-emerald-500/60 bg-emerald-500/10'
      : purge.ok === false
      ? 'border-red-500/60 bg-red-500/10'
      : 'border-slate-700 bg-slate-800/60';
  const verifyCls =
    verify.ok === true
      ? 'border-emerald-500/60 bg-emerald-500/10'
      : verify.ok === false
      ? 'border-red-500/60 bg-red-500/10'
      : 'border-slate-700 bg-slate-800/60';

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-white mb-2">Cloudflare Status</h1>
      <p className="text-sm text-slate-400 mb-6">
        Auto-refreshes every 30s. Last check: {data.checkedAt}. Values are never returned —
        only presence + source variable name.
      </p>

      {!allSecrets && (
        <div className="mb-6 p-4 rounded-lg border-2 border-red-500/60 bg-red-500/10 text-red-200 text-sm">
          ⚠ One or more Cloudflare secrets are missing. GitHub Actions
          post-deploy purge will log a warning and skip — old HTML may
          survive at the edge until secrets are added.
        </div>
      )}

      <h2 className="text-lg font-semibold text-white mb-3">Secrets</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <SecretCard label="CF_API_TOKEN" s={data.secrets.CF_API_TOKEN} />
        <SecretCard label="CF_ZONE_ID (phlabs.co.uk)" s={data.secrets.CF_ZONE_ID} />
        <SecretCard
          label="CF_ZONE_ID_PROHEALTH"
          s={data.secrets.CF_ZONE_ID_PROHEALTH}
        />
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">Last Purge</h2>
      <div className={`p-4 rounded-lg border-2 mb-6 ${purgeCls}`}>
        {!purge.requested ? (
          <div className="text-slate-300">No purge recorded yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-400">Result:</span>{' '}
              <span className="font-mono text-white">
                {purge.ok === true ? '✓ OK' : purge.ok === false ? '✗ FAILED' : 'unknown'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">HTTP status:</span>{' '}
              <span className="font-mono text-white">{purge.status ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-400">Zone:</span>{' '}
              <span className="font-mono text-white">{purge.zone ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-400">Build:</span>{' '}
              <span className="font-mono text-white break-all">{purge.buildId ?? '—'}</span>
            </div>
            <div className="md:col-span-2">
              <span className="text-slate-400">At:</span>{' '}
              <span className="font-mono text-white">{purge.at ?? '—'}</span>
            </div>
            {purge.detail && (
              <div className="md:col-span-2">
                <span className="text-slate-400">Detail:</span>{' '}
                <span className="font-mono text-white break-all">{purge.detail}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">Last Verify (edge cache probe)</h2>
      <div className={`p-4 rounded-lg border-2 ${verifyCls}`}>
        {!verify.requested ? (
          <div className="text-slate-300">
            No verify recorded yet — <code className="text-slate-100">verify-edge-cache.sh</code>{' '}
            runs from GitHub Actions <code className="text-slate-100">post-deploy-purge</code>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-slate-400">Result:</span>{' '}
              <span className="font-mono text-white">
                {verify.ok === true ? '✓ MISS/BYPASS' : verify.ok === false ? '✗ HIT/STALE' : 'unknown'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">HITs:</span>{' '}
              <span className="font-mono text-white">{verify.hits ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-400">MISSes:</span>{' '}
              <span className="font-mono text-white">{verify.misses ?? '—'}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-slate-500">
        Diagnostic endpoint:{' '}
        <code className="text-slate-300">/api/public/cloudflare-secrets-status</code> · related:{' '}
        <code className="text-slate-300">/api/public/publish-status</code>
      </div>
    </div>
  );
}

/**
 * Runtime guard for the /admin/* SPA fallback.
 *
 * On mount we:
 *  1. Show the current served URL so admins can sanity-check the route
 *     they're sitting on (useful when reproducing refresh-404 reports).
 *  2. Probe a synthetic `/admin/__spa_probe-<rand>` subpath with a HEAD
 *     fetch. Because `admin` is a known root in `src/lib/known-roots.ts`,
 *     the Worker must serve the SPA shell (HTTP 200, HTML) for ANY
 *     `/admin/...` URL — even one the router doesn't know. If we ever
 *     get back a 404 / non-HTML, the SPA fallback has regressed and
 *     refreshing `/admin/<tab>` will start breaking for users.
 *
 * Banner is hidden in the happy path so it doesn't add noise. Failure
 * states render a visible red banner with the failing URL + status so
 * the regression is caught immediately.
 */
import { useEffect, useState } from 'react';

type ProbeState =
  | { status: 'checking' }
  | { status: 'ok'; servedUrl: string; httpStatus: number; contentType: string }
  | { status: 'fail'; servedUrl: string; httpStatus: number; contentType: string; reason: string };

export default function AdminSpaFallbackBanner() {
  const [state, setState] = useState<ProbeState>({ status: 'checking' });
  const [currentUrl, setCurrentUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCurrentUrl(window.location.href);

    const rand = Math.random().toString(36).slice(2, 10);
    const probeUrl = `/admin/__spa_probe-${rand}`;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(probeUrl, {
          method: 'GET',
          headers: { accept: 'text/html' },
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (cancelled) return;
        const ct = res.headers.get('content-type') ?? '';
        const ok = res.status >= 200 && res.status < 300 && ct.includes('text/html');
        if (ok) {
          setState({ status: 'ok', servedUrl: probeUrl, httpStatus: res.status, contentType: ct });
        } else {
          setState({
            status: 'fail',
            servedUrl: probeUrl,
            httpStatus: res.status,
            contentType: ct,
            reason:
              res.status === 404
                ? 'SPA fallback returned 404 — refreshing /admin/<tab> will break.'
                : `Unexpected response (${res.status} ${ct || 'unknown content-type'}).`,
          });
        }
      } catch (e) {
        if (cancelled) return;
        setState({
          status: 'fail',
          servedUrl: probeUrl,
          httpStatus: 0,
          contentType: '',
          reason: `Probe failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'ok') {
    // Quiet healthy state — single thin line surfacing the diagnostic
    // facts we'd otherwise lose: probe path, HTTP status, content-type,
    // and whether the response was HTML. Makes regressions trivial to
    // attribute when an admin pings us.
    const isHtml = state.contentType.includes('text/html');
    return (
      <div
        className="px-4 py-1.5 text-[11px] font-mono text-slate-500 border-b border-slate-800 bg-slate-950/60 flex flex-wrap gap-x-3 gap-y-1"
        data-testid="admin-spa-fallback-banner-ok"
        data-probe-path={state.servedUrl}
        data-probe-status={String(state.httpStatus)}
        data-probe-html={isHtml ? 'true' : 'false'}
      >
        <span className="text-emerald-400">● SPA fallback OK</span>
        <span>at {currentUrl}</span>
        <span className="text-slate-600">
          probe <span className="text-slate-400">{state.servedUrl}</span>
          {' '}→ <span className="text-slate-400">HTTP {state.httpStatus}</span>
          {' · '}<span className="text-slate-400">{state.contentType.split(';')[0] || 'unknown'}</span>
          {' · '}
          <span className={isHtml ? 'text-emerald-400' : 'text-amber-400'}>
            {isHtml ? 'HTML ✓' : 'non-HTML ⚠'}
          </span>
        </span>
      </div>
    );
  }

  if (state.status === 'checking') {
    return (
      <div
        className="px-4 py-1.5 text-[11px] font-mono text-slate-500 border-b border-slate-800 bg-slate-950/60"
        data-testid="admin-spa-fallback-banner-checking"
      >
        ⏳ Verifying /admin/* SPA fallback…
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="px-4 py-3 text-sm border-b-2 border-red-500 bg-red-950/70 text-red-100"
      data-testid="admin-spa-fallback-banner-fail"
    >
      <strong className="block font-semibold text-red-200">
        ⚠ /admin/* SPA fallback regression detected
      </strong>
      <div className="mt-1 font-mono text-xs text-red-100/90">
        Current URL: <span className="text-white">{currentUrl}</span>
      </div>
      <div className="mt-0.5 font-mono text-xs text-red-100/90">
        Probe URL: <span className="text-white">{state.servedUrl}</span> → HTTP{' '}
        <span className="text-white">{state.httpStatus || 'network-error'}</span>
        {state.contentType ? ` · ${state.contentType.split(';')[0]}` : ''}
      </div>
      <div className="mt-1 text-red-50/90">{state.reason}</div>
      <div className="mt-1 text-[11px] text-red-200/80">
        Check <code>src/lib/known-roots.ts</code> includes <code>"admin"</code> and that
        the Worker / hosting rewrite serves the SPA shell for unknown <code>/admin/*</code>{' '}
        subpaths.
      </div>
    </div>
  );
}

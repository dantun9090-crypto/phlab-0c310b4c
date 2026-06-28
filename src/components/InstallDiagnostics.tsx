import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Share, PlusSquare, Apple } from 'lucide-react';

interface SWInfo {
  supported: boolean;
  registered: boolean;
  scope?: string;
  scriptURL?: string;
  state?: string;
  controller: boolean;
}

interface Diagnostics {
  sw: SWInfo;
  bipFired: boolean;
  bipReason: string;
  standalone: boolean;
  isSecure: boolean;
  manifestLinked: boolean;
  isIos: boolean;
  isIosSafari: boolean;
  userAgent: string;
}

/**
 * Visible diagnostics panel for /install — confirms whether the
 * service worker is registered and whether `beforeinstallprompt`
 * has fired. Useful when debugging "the button does nothing".
 */
export default function InstallDiagnostics() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let bipFired = false;
    const onBip = () => {
      bipFired = true;
      void refresh();
    };
    window.addEventListener('beforeinstallprompt', onBip);

    async function refresh() {
      const supported = 'serviceWorker' in navigator;
      let registered = false;
      let scope: string | undefined;
      let scriptURL: string | undefined;
      let state: string | undefined;
      if (supported) {
        try {
          const reg = await navigator.serviceWorker.getRegistration('/');
          if (reg) {
            registered = true;
            scope = reg.scope;
            const sw = reg.active || reg.waiting || reg.installing;
            if (sw) {
              scriptURL = sw.scriptURL;
              state = sw.state;
            }
          }
        } catch {
          /* ignore */
        }
      }
      const manifestLinked = !!document.querySelector('link[rel="manifest"]');
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      const ua = navigator.userAgent;
      const isIpadOS = /Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1;
      const isIos = /iphone|ipad|ipod/i.test(ua) || isIpadOS;
      const isIosSafari = isIos && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
      const isChromium = !isIos && /chrome|edg|opr|brave/i.test(ua) && !/firefox|fxios/i.test(ua);
      const isFirefox = /firefox|fxios/i.test(ua);

      let bipReason = '';
      if (bipFired) bipReason = 'Fired — native prompt available.';
      else if (standalone) bipReason = 'Already installed (running standalone).';
      else if (isIos) bipReason = 'iOS Safari never fires this event — use Share → Add to Home Screen (see instructions below).';
      else if (isFirefox) bipReason = 'Firefox does not support web app install.';
      else if (!isChromium) bipReason = 'Browser does not support beforeinstallprompt.';
      else if (!registered) bipReason = 'No service worker yet — Chromium requires one for installability.';
      else bipReason = 'Waiting — Chromium fires the event once engagement heuristics pass (try interacting with the page).';

      setDiag({
        sw: { supported, registered, scope, scriptURL, state, controller: !!navigator.serviceWorker?.controller },
        bipFired,
        bipReason,
        standalone,
        isSecure: window.isSecureContext,
        manifestLinked,
        isIos,
        isIosSafari,
        userAgent: ua,
      });
    }

    void refresh();
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
    };
  }, [tick]);

  if (!diag) return null;

  const Row = ({ ok, label, value, warn }: { ok: boolean; label: string; value: string; warn?: boolean }) => (
    <div className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
      ) : warn ? (
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-sm text-slate-200 break-words font-mono">{value}</div>
      </div>
    </div>
  );

  return (
    <div
      data-testid="install-diagnostics"
      className="mt-8 p-5 rounded-2xl border"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-white">Install diagnostics</h2>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          className="flex items-center gap-1.5 text-xs text-slate-300 px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/5"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <Row
        ok={diag.isSecure}
        label="Secure context (HTTPS)"
        value={diag.isSecure ? 'yes' : 'no — install requires HTTPS'}
      />
      <Row
        ok={diag.manifestLinked}
        label="Web app manifest"
        value={diag.manifestLinked ? 'linked in <head>' : 'missing <link rel="manifest">'}
      />
      <Row
        ok={diag.sw.supported}
        label="Service worker API"
        value={diag.sw.supported ? 'supported' : 'not supported by this browser'}
      />
      <Row
        ok={diag.sw.registered}
        warn={!diag.sw.registered && diag.sw.supported}
        label="Service worker registered"
        value={
          diag.sw.registered
            ? `${diag.sw.scriptURL ?? '(unknown script)'} · state=${diag.sw.state ?? '?'} · scope=${diag.sw.scope ?? '/'}`
            : 'not yet — will register on production phlabs.co.uk after load'
        }
      />
      <Row
        ok={diag.sw.controller}
        warn={!diag.sw.controller && diag.sw.registered}
        label="Controlling this page"
        value={diag.sw.controller ? 'yes' : 'no — first registration only controls future loads'}
      />
      <Row
        ok={diag.bipFired}
        warn={!diag.bipFired && !diag.standalone}
        label="beforeinstallprompt event"
        value={diag.bipReason}
      />
      <Row
        ok={true}
        label="Display mode"
        value={diag.standalone ? 'standalone (installed)' : 'browser tab'}
      />

      <details className="mt-3">
        <summary className="text-xs text-slate-400 cursor-pointer">User agent</summary>
        <code className="text-[11px] text-slate-500 break-all block mt-1">{diag.userAgent}</code>
      </details>
    </div>
  );
}

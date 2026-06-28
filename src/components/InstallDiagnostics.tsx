import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Share, PlusSquare, Apple, MoreVertical } from 'lucide-react';

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
  isIosChrome: boolean;
  userAgent: string;
}

interface RefreshLogEntry {
  ts: number;
  ok: boolean;
  summary: string;
}

/**
 * Visible diagnostics panel for /install — confirms whether the
 * service worker is registered and whether `beforeinstallprompt`
 * has fired. Useful when debugging "the button does nothing".
 */
export default function InstallDiagnostics() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [tick, setTick] = useState(0);
  const [log, setLog] = useState<RefreshLogEntry[]>([]);
  const bipFiredRef = useRef(false);

  useEffect(() => {
    const onBip = () => {
      bipFiredRef.current = true;
      void refresh(false);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    async function refresh(userInitiated: boolean) {
      const supported = 'serviceWorker' in navigator;
      let registered = false;
      let scope: string | undefined;
      let scriptURL: string | undefined;
      let state: string | undefined;
      let ok = true;
      let errMsg = '';
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
        } catch (e) {
          ok = false;
          errMsg = e instanceof Error ? e.message : String(e);
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
      const isIosChrome = isIos && /crios/i.test(ua);
      const isChromium = !isIos && /chrome|edg|opr|brave/i.test(ua) && !/firefox|fxios/i.test(ua);
      const isFirefox = /firefox|fxios/i.test(ua);

      const bipFired = bipFiredRef.current;
      let bipReason = '';
      if (bipFired) bipReason = 'Fired — native prompt available.';
      else if (standalone) bipReason = 'Already installed (running standalone).';
      else if (isIos) bipReason = 'iOS never fires this event — use Share → Add to Home Screen (see instructions below).';
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
        isIosChrome,
        userAgent: ua,
      });

      if (userInitiated) {
        const summary = ok
          ? `SW ${registered ? `registered (${state ?? '?'})` : 'not registered'} · BIP ${bipFired ? 'fired' : 'pending'} · manifest ${manifestLinked ? 'ok' : 'missing'}`
          : `error: ${errMsg}`;
        setLog((prev) =>
          [{ ts: Date.now(), ok, summary }, ...prev].slice(0, 5),
        );
      }
    }

    void refresh(false);
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

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-GB', { hour12: false });
  };

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
          data-testid="install-diagnostics-refresh"
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

      {/* Refresh log */}
      <div
        data-testid="install-diagnostics-refresh-log"
        className="mt-4 p-3 rounded-xl border"
        style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
          Refresh log {log.length > 0 && <span className="text-slate-500 normal-case">· last {log.length}</span>}
        </div>
        {log.length === 0 ? (
          <div className="text-xs text-slate-500" data-testid="refresh-log-empty">
            No manual refresh yet — click Refresh to record a snapshot.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {log.map((entry) => (
              <li
                key={entry.ts}
                data-testid="refresh-log-entry"
                className="flex items-start gap-2 text-xs text-slate-300 font-mono"
              >
                {entry.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span className="text-slate-400 shrink-0">{formatTime(entry.ts)}</span>
                <span className="text-slate-200 break-words">{entry.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {diag.isIos && !diag.standalone && (
        <div
          data-testid="ios-install-instructions"
          className="mt-4 p-4 rounded-xl border"
          style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.25)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Apple className="w-4 h-4 text-blue-300" />
            <h3 className="text-sm font-semibold text-white">
              {diag.isIosSafari
                ? 'Install on iPhone / iPad (Safari)'
                : diag.isIosChrome
                  ? 'Install on iPhone / iPad (Chrome on iOS)'
                  : 'Open in Safari to install on iPhone / iPad'}
            </h3>
          </div>

          {/* Safari branch */}
          {diag.isIosSafari && (
            <ol className="space-y-2.5 text-sm text-slate-200" data-testid="ios-safari-steps">
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">1</span>
                <span>
                  Tap the <Share className="inline w-4 h-4 mx-0.5 align-text-bottom text-blue-300" />
                  <strong> Share</strong> button at the bottom of Safari (top-right on iPad).
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">2</span>
                <span>
                  Scroll and tap <PlusSquare className="inline w-4 h-4 mx-0.5 align-text-bottom text-blue-300" />
                  <strong> Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">3</span>
                <span>Confirm the name <strong>PH Labs</strong> and tap <strong>Add</strong> — the app icon appears on your home screen.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">4</span>
                <span>Tap the new PH Labs icon — it opens the catalogue full-screen, just like a native app.</span>
              </li>
            </ol>
          )}

          {/* Chrome on iOS branch (iOS 16.4+ supports Add to Home Screen from Chrome's Share sheet) */}
          {diag.isIosChrome && (
            <ol className="space-y-2.5 text-sm text-slate-200" data-testid="ios-chrome-steps">
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">1</span>
                <span>
                  Tap the <MoreVertical className="inline w-4 h-4 mx-0.5 align-text-bottom text-blue-300" />
                  <strong> ⋯ menu</strong> (bottom-right of Chrome on iOS).
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">2</span>
                <span>
                  Tap <Share className="inline w-4 h-4 mx-0.5 align-text-bottom text-blue-300" />
                  <strong> Share…</strong>, then choose <PlusSquare className="inline w-4 h-4 mx-0.5 align-text-bottom text-blue-300" />
                  <strong> Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">3</span>
                <span>
                  If the option is missing, open the same page in Safari instead —
                  <a
                    href="https://phlabs.co.uk/install"
                    className="underline text-blue-300 hover:text-blue-200 mx-1"
                  >
                    phlabs.co.uk/install
                  </a>
                  — and follow the Safari steps.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">4</span>
                <span>Tap the new PH Labs icon on your home screen — it opens the catalogue full-screen.</span>
              </li>
            </ol>
          )}

          {/* Other iOS browsers (Firefox, Edge, Opera on iOS) */}
          {!diag.isIosSafari && !diag.isIosChrome && (
            <>
              <p className="text-xs text-blue-200/80 mb-3">
                Apple only allows installing web apps from <strong>Safari</strong>. Open
                <a
                  href="https://phlabs.co.uk/install"
                  className="underline text-blue-300 hover:text-blue-200 mx-1"
                >
                  phlabs.co.uk/install
                </a>
                in Safari, then:
              </p>
              <ol className="space-y-2.5 text-sm text-slate-200" data-testid="ios-other-steps">
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">1</span>
                  <span>
                    Tap <Share className="inline w-4 h-4 mx-0.5 align-text-bottom text-blue-300" />
                    <strong> Share</strong> → <PlusSquare className="inline w-4 h-4 mx-0.5 align-text-bottom text-blue-300" />
                    <strong> Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold flex items-center justify-center">2</span>
                  <span>Confirm <strong>PH Labs</strong> and tap <strong>Add</strong>.</span>
                </li>
              </ol>
            </>
          )}

          <p className="mt-3 text-[11px] text-blue-200/70">
            iOS does not expose <code>beforeinstallprompt</code>, so no in-page button can replace these steps.
          </p>
        </div>
      )}

      <details className="mt-3">
        <summary className="text-xs text-slate-400 cursor-pointer">User agent</summary>
        <code className="text-[11px] text-slate-500 break-all block mt-1">{diag.userAgent}</code>
      </details>
    </div>
  );
}

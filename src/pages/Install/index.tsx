import { useEffect, useMemo, useState } from 'react';
import { Smartphone, Apple, Monitor, Chrome, Share, MoreVertical, Download, CheckCircle2 } from 'lucide-react';
import InstallAppButton from '@/components/InstallAppButton';

type Platform =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'desktop-chromium'
  | 'desktop-safari'
  | 'firefox'
  | 'unknown';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const isIpadOS = /Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1;
  const isIos = /iphone|ipad|ipod/i.test(ua) || isIpadOS;
  if (isIos) {
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    return isSafari ? 'ios-safari' : 'ios-other';
  }
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/android/i.test(ua)) return 'android-chrome';
  if (/edg|chrome|opr|brave/i.test(ua)) return 'desktop-chromium';
  if (/safari/i.test(ua)) return 'desktop-safari';
  return 'unknown';
}

export default function InstallPage() {
  const [mounted, setMounted] = useState(false);
  const [installed, setInstalled] = useState(false);
  const platform = useMemo<Platform>(() => detectPlatform(), []);

  useEffect(() => {
    setMounted(true);
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setInstalled(isStandalone);

    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);

    // SEO
    document.title = 'Install PH Labs App — Add to your device';
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content =
      'Install the PH Labs app on your iPhone, Android, or desktop for one-tap access to UK research peptides.';
    meta.id = 'install-desc';
    document.head.appendChild(meta);
    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      document.getElementById('install-desc')?.remove();
    };
  }, []);

  const label = (() => {
    switch (platform) {
      case 'ios-safari':
        return 'iPhone / iPad — Safari';
      case 'ios-other':
        return 'iPhone / iPad — open in Safari';
      case 'android-chrome':
        return 'Android — Chrome / Edge';
      case 'desktop-chromium':
        return 'Desktop — Chrome / Edge / Brave';
      case 'desktop-safari':
        return 'Mac — Safari';
      case 'firefox':
        return 'Firefox (not supported)';
      default:
        return 'Your browser';
    }
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-5 py-12 md:py-20">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 shadow-2xl shadow-emerald-500/25"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <Download className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Install the PH Labs App
          </h1>
          <p className="text-slate-300 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Add PH Labs to your home screen for faster access, fullscreen browsing,
            and a real app experience — no app store required.
          </p>
        </div>

        {installed && (
          <div className="mb-8 flex items-center gap-3 p-4 rounded-xl border"
            style={{ background: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.30)' }}>
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-emerald-200 text-sm">
              The PH Labs app is already installed on this device. Look for the icon on your home screen.
            </p>
          </div>
        )}

        {/* Detected platform — quick action */}
        {mounted && !installed && (
          <div className="mb-10 p-5 md:p-6 rounded-2xl border"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Detected</p>
            <p className="text-white font-semibold text-lg mb-4">{label}</p>
            <InstallAppButton />
            <QuickActions platform={platform} />
            <p className="text-slate-400 text-xs mt-3">
              Tap the button — if your browser supports a native prompt it'll appear,
              otherwise follow the platform-specific link below.
            </p>
          </div>
        )}

        {/* Per-platform guides */}
        <h2 className="text-xl font-bold mb-5">Step-by-step by device</h2>
        <div className="space-y-4">
          <Guide
            icon={<Apple className="w-5 h-5" />}
            title="iPhone / iPad (Safari)"
            steps={[
              <>Open <strong>phlabs.co.uk</strong> in <strong>Safari</strong>.</>,
              <>Tap the <Share className="inline w-4 h-4 mx-1 align-text-bottom" /> <strong>Share</strong> button at the bottom.</>,
              <>Scroll and tap <strong>Add to Home Screen</strong>.</>,
              <>Tap <strong>Add</strong> — the icon will appear on your home screen.</>,
            ]}
          />
          <Guide
            icon={<Smartphone className="w-5 h-5" />}
            title="Android (Chrome / Edge / Brave)"
            steps={[
              <>Open <strong>phlabs.co.uk</strong> in Chrome (or Edge / Brave).</>,
              <>Tap the menu <MoreVertical className="inline w-4 h-4 mx-1 align-text-bottom" /> in the top right.</>,
              <>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>,
              <>Confirm <strong>Install</strong>.</>,
            ]}
          />
          <Guide
            icon={<Chrome className="w-5 h-5" />}
            title="Desktop (Chrome / Edge / Brave)"
            steps={[
              <>Open <strong>phlabs.co.uk</strong>.</>,
              <>Click the <strong>install icon</strong> in the address bar (right side), or open the menu <MoreVertical className="inline w-4 h-4 mx-1 align-text-bottom" />.</>,
              <>Choose <strong>Install PH Labs…</strong>.</>,
              <>The app opens in its own window and is added to your dock / start menu.</>,
            ]}
          />
          <Guide
            icon={<Monitor className="w-5 h-5" />}
            title="Mac (Safari 17+)"
            steps={[
              <>Open <strong>phlabs.co.uk</strong> in Safari.</>,
              <>In the menu bar choose <strong>File → Add to Dock…</strong></>,
              <>Confirm — the PH Labs icon appears in your Dock.</>,
            ]}
          />
          <Guide
            icon={<Smartphone className="w-5 h-5" />}
            title="iPhone — Chrome / Firefox"
            steps={[
              <>On iOS, only <strong>Safari</strong> can add apps to the home screen.</>,
              <>Open <strong>phlabs.co.uk</strong> in Safari, then follow the iPhone / iPad steps above.</>,
            ]}
          />
        </div>

        {/* FAQ */}
        <h2 className="text-xl font-bold mt-12 mb-5">Common questions</h2>
        <div className="space-y-3">
          <Faq q="Is this a real app?">
            Yes — it's a Progressive Web App. It runs in its own window with an icon, just like a native app,
            but installs in seconds and updates automatically with no app-store review.
          </Faq>
          <Faq q="Will it use a lot of storage?">
            No — under 5 MB. The app is the website wrapped in a native shell.
          </Faq>
          <Faq q="Can I uninstall it?">
            Yes. On phones, long-press the icon and choose Remove / Uninstall. On desktop, open the app and
            use the menu → Uninstall PH Labs.
          </Faq>
          <Faq q="Why doesn't the install prompt appear automatically?">
            Browsers show the native prompt only after you've spent some time on the site and haven't already
            dismissed it. Use the button above to install anytime.
          </Faq>
        </div>
      </div>
    </div>
  );
}

function Guide({ icon, title, steps }: { icon: React.ReactNode; title: string; steps: React.ReactNode[] }) {
  return (
    <div className="p-5 rounded-2xl border"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-emerald-400"
          style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
          {icon}
        </div>
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <ol className="space-y-2 pl-1">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-slate-300 text-sm leading-relaxed">
            <span className="shrink-0 w-5 h-5 rounded-full text-xs font-semibold flex items-center justify-center text-emerald-300"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group p-4 rounded-xl border"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <summary className="cursor-pointer font-semibold text-white text-sm flex items-center justify-between">
        {q}
        <span className="text-emerald-400 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
      </summary>
      <p className="text-slate-300 text-sm leading-relaxed mt-3">{children}</p>
    </details>
  );
}

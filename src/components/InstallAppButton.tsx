import { useEffect, useMemo, useState } from 'react';
import { Download, Share, MoreVertical } from 'lucide-react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform =
  | 'ios-safari'      // iPhone/iPad Safari — Add to Home Screen
  | 'ios-other'       // iOS Chrome/Firefox/etc — must open in Safari
  | 'android-chrome'  // beforeinstallprompt available
  | 'desktop-chromium'// Chrome/Edge/Brave/Opera desktop — beforeinstallprompt
  | 'firefox'         // no PWA install
  | 'desktop-safari'  // macOS Safari 17+ supports Add to Dock
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

export default function InstallAppButton({ onAfter }: { onAfter?: () => void }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [mounted, setMounted] = useState(false);

  const platform = useMemo<Platform>(() => detectPlatform(), []);
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches ||
      (window.navigator as any).standalone === true);

  useEffect(() => {
    setMounted(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // SSR-safe + hide when already installed
  if (!mounted || installed || isStandalone) return null;
  // Firefox has no PWA install path on any platform
  if (platform === 'firefox') return null;

  const handleClick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {
        /* user dismissed */
      }
      setDeferred(null);
      onAfter?.();
      return;
    }
    setShowHint((v) => !v);
  };

  const hint = (() => {
    switch (platform) {
      case 'ios-safari':
        return (
          <>
            Tap <Share className="inline w-3.5 h-3.5 mx-0.5 align-text-bottom" />{' '}
            <strong>Share</strong> at the bottom, then{' '}
            <strong>Add to Home Screen</strong>.
          </>
        );
      case 'ios-other':
        return (
          <>
            On iPhone/iPad, open <strong>phlabs.co.uk</strong> in <strong>Safari</strong>,
            then tap <Share className="inline w-3.5 h-3.5 mx-0.5 align-text-bottom" />{' '}
            <strong>Share → Add to Home Screen</strong>.
          </>
        );
      case 'android-chrome':
        return (
          <>
            Open the browser menu{' '}
            <MoreVertical className="inline w-3.5 h-3.5 mx-0.5 align-text-bottom" /> and tap{' '}
            <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </>
        );
      case 'desktop-chromium':
        return (
          <>
            Click the install icon in the address bar, or open the menu{' '}
            <MoreVertical className="inline w-3.5 h-3.5 mx-0.5 align-text-bottom" /> →{' '}
            <strong>Install PH Labs</strong>.
          </>
        );
      case 'desktop-safari':
        return (
          <>
            In Safari, choose <strong>File → Add to Dock…</strong> (macOS Sonoma or newer).
          </>
        );
      default:
        return (
          <>
            Use your browser's menu and choose <strong>Install app</strong> or{' '}
            <strong>Add to Home screen</strong>.
          </>
        );
    }
  })();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={showHint}
        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold min-h-[52px] w-full transition-colors"
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))',
          color: '#6ee7b7',
          border: '1px solid rgba(16,185,129,0.25)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Download className="w-4 h-4 opacity-80 shrink-0" />
        <span className="text-[15px] truncate">Install PH Labs App</span>
      </button>

      {showHint && (
        <div
          role="note"
          className="px-4 py-3 rounded-xl text-[13px] leading-relaxed"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#cfe1f5',
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

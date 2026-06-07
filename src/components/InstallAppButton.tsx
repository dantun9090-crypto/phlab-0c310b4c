import { useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallAppButton({ onAfter }: { onAfter?: () => void }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true);

  const isIos =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/crios|fxios|edgios/i.test(navigator.userAgent);

  useEffect(() => {
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

  if (installed || isStandalone) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => {});
      setDeferred(null);
      onAfter?.();
      return;
    }
    if (isIos) {
      setShowIosHint((v) => !v);
      return;
    }
    // Android/desktop without prompt yet — show iOS-style hint as generic fallback
    setShowIosHint((v) => !v);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold min-h-[52px] w-full"
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))',
          color: '#6ee7b7',
          border: '1px solid rgba(16,185,129,0.25)',
        }}
      >
        <Download className="w-4 h-4 opacity-80" />
        <span className="text-[15px]">Install PH Labs App</span>
      </button>

      {showIosHint && (
        <div
          className="px-4 py-3 rounded-xl text-[13px] leading-relaxed"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#cfe1f5',
          }}
        >
          {isIos ? (
            <>
              On iPhone: tap <Share className="inline w-3.5 h-3.5 mx-0.5" /> <strong>Share</strong>,
              then choose <strong>Add to Home Screen</strong>.
            </>
          ) : (
            <>
              Open your browser menu (⋮) and tap <strong>Install app</strong> or{' '}
              <strong>Add to Home screen</strong>.
            </>
          )}
        </div>
      )}
    </div>
  );
}

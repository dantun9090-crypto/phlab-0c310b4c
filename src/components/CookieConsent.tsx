import { useState, useEffect } from 'react';
import { Cookie, ShieldCheck, BarChart2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'php_cookie_consent';
const OPEN_EVENT = 'php:open-cookie-settings';

export type CookiePreferences = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
};

export function getCookiePreferences(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Re-open the consent banner from anywhere (e.g. footer "Cookie Settings"). */
export function openCookieSettings() {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  } catch {
    /* noop */
  }
}

function savePreferences(prefs: CookiePreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  try {
    window.dispatchEvent(new CustomEvent('php:cookie-consent-changed', {
      detail: { analytics: prefs.analytics, marketing: prefs.marketing },
    }));
  } catch {
    /* noop */
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (getCookiePreferences()) return;

    // Wait until the Research Gate is confirmed/dismissed before showing
    // the cookie banner — otherwise on small viewports the banner overlaps
    // the gate's primary CTA and the user can't enter the store.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(true), 600);
    };

    const isGateBlocking = () => {
      try {
        const raw = localStorage.getItem('php_research_confirmed');
        if (!raw) return true;
        const { ts } = JSON.parse(raw);
        return !(Date.now() - ts < 30 * 864e5);
      } catch { return false; }
    };

    if (!isGateBlocking()) {
      show();
      return () => { if (timer) clearTimeout(timer); };
    }

    // Wait for the gate to clear (covers both confirm and dismiss), with polling as fallback.
    const poll = setInterval(() => {
      if (!isGateBlocking() || !document.querySelector('[aria-label="Research use confirmation"]')) {
        clearInterval(poll);
        show();
      }
    }, 400);
    const onGateCleared = () => {
      clearInterval(poll);
      show();
    };
    window.addEventListener('php:research-gate-cleared', onGateCleared, { once: true });

    return () => {
      clearInterval(poll);
      window.removeEventListener('php:research-gate-cleared', onGateCleared);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const acceptAll = () => {
    savePreferences({ essential: true, analytics: true, marketing: true });
    setVisible(false);
  };

  const essentialOnly = () => {
    savePreferences({ essential: true, analytics: false, marketing: false });
    setVisible(false);
  };

  const acceptSelected = () => {
    savePreferences({ essential: true, analytics, marketing });
    setVisible(false);
  };

  return (
    <div
      className={`fixed bottom-0 sm:bottom-4 left-0 right-0 sm:left-4 sm:right-4 z-[9999] flex justify-center transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Cookie consent"
    >
      <div className="w-full sm:max-w-2xl bg-[#0b1a30] border border-white/[0.08] sm:rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

        <div className="flex items-start sm:items-center gap-3 px-4 sm:px-5 py-4 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <Cookie className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#f0f6ff] text-sm font-semibold leading-snug">We use cookies</p>
            <p className="text-[#9cb8d9] text-xs mt-0.5 leading-relaxed">
              Essential cookies only by default. We never sell your data.{" "}
              <Link to="/privacy-policy" onClick={() => setVisible(false)} className="text-blue-400 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>

        {/* Details panel — CSS max-height transition, zero JS overhead */}
        <div
          className="overflow-hidden transition-all duration-220"
          style={{ maxHeight: showDetails ? '400px' : '0px', opacity: showDetails ? 1 : 0 }}
        >
          <div className="px-4 sm:px-5 py-4 space-y-2.5 border-b border-white/[0.06] max-h-[45vh] overflow-y-auto">

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
              <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[#f0f6ff] text-xs font-semibold">Essential Cookies</p>
                  <span className="text-green-400 text-[10px] font-medium bg-green-400/10 px-2 py-0.5 rounded-full whitespace-nowrap">Always Active</span>
                </div>
                <p className="text-[#9cb8d9] text-[11px] mt-1 leading-relaxed">
                  Required for the site to function: cart, checkout, session. Cannot be disabled.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
              <BarChart2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[#f0f6ff] text-xs font-semibold">Analytics Cookies</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={analytics}
                    aria-label="Toggle analytics cookies"
                    onClick={() => setAnalytics(v => !v)}
                    className={"relative w-10 h-6 rounded-full transition-colors shrink-0 " + (analytics ? "bg-blue-600" : "bg-white/10")}
                  >
                    <span className="sr-only">Toggle analytics cookies</span>
                    <span aria-hidden="true" className={"absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform " + (analytics ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
                <p className="text-[#9cb8d9] text-[11px] mt-1 leading-relaxed">
                  Helps us understand site usage. No personal data stored.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
              <Cookie className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[#f0f6ff] text-xs font-semibold">Marketing Cookies</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={marketing}
                    aria-label="Toggle marketing cookies"
                    onClick={() => setMarketing(v => !v)}
                    className={"relative w-10 h-6 rounded-full transition-colors shrink-0 " + (marketing ? "bg-blue-600" : "bg-white/10")}
                  >
                    <span className="sr-only">Toggle marketing cookies</span>
                    <span aria-hidden="true" className={"absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform " + (marketing ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
                <p className="text-[#9cb8d9] text-[11px] mt-1 leading-relaxed">
                  Used for personalised ads. We do not share data without consent.
                </p>
              </div>
            </div>

          </div>
        </div>

        <div className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row gap-2">
          <button
            onClick={acceptAll}
            className="w-full sm:flex-1 min-h-[44px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Accept All
          </button>
          <button
            onClick={essentialOnly}
            className="w-full sm:flex-1 min-h-[44px] text-[#9cb8d9] hover:text-[#f0f6ff] text-sm font-medium border border-white/[0.1] hover:border-white/[0.2] rounded-xl transition-colors"
          >
            Essential Only
          </button>
          {showDetails ? (
            <button
              onClick={acceptSelected}
              className="w-full sm:flex-1 min-h-[44px] text-[#9cb8d9] hover:text-[#f0f6ff] text-sm font-medium border border-white/[0.1] hover:border-white/[0.2] rounded-xl transition-colors"
            >
              Save My Choices
            </button>
          ) : (
            <button
              onClick={() => setShowDetails(true)}
              className="w-full sm:flex-1 min-h-[44px] text-[#9cb8d9] hover:text-[#f0f6ff] text-sm font-medium border border-white/[0.1] hover:border-white/[0.2] rounded-xl transition-colors"
            >
              Manage Cookies
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

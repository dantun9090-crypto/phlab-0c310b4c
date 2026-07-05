/**
 * NewsletterPopup — dismissible email-capture modal for the homepage.
 *
 * Behaviour:
 *  - Waits `delaySeconds` after mount, then opens (if enabled + not seen).
 *  - Skips if `phlabs_newsletter_seen` timestamp < cooldownDays old.
 *  - Skips if the signed-in user's email is already in `emailSubscribers`.
 *  - Locks focus, closes on Escape or backdrop click.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Loader2, CheckCircle2, Mail } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  getPopupConfig,
  type PopupConfig,
  DEFAULT_POPUP_CONFIG,
} from '@/lib/newsletter-config';
import {
  subscribeToNewsletter,
  isEmailSubscribed,
  emailSchema,
} from '@/lib/newsletter';

const STORAGE_KEY = 'phlabs_newsletter_seen';
const DEBUG_KEY = 'phlabs_newsletter_debug';

/** Reads debug flags from URL (?newsletter=preview|reset|debug) and localStorage. */
function readDebugFlags(): { force: boolean; reset: boolean; persist: boolean } {
  if (typeof window === 'undefined') return { force: false, reset: false, persist: false };
  const params = new URLSearchParams(window.location.search);
  const q = (params.get('newsletter') ?? '').toLowerCase();
  const persist = window.localStorage.getItem(DEBUG_KEY) === '1';
  return {
    force: q === 'preview' || q === 'debug' || persist,
    reset: q === 'reset' || q === 'preview',
    persist: q === 'debug' || persist,
  };
}

function withinCooldown(cooldownDays: number): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    const ageMs = Date.now() - ts;
    return ageMs < cooldownDays * 24 * 60 * 60 * 1000;
  } catch {
    return true; // fail-closed: don't nag if storage is unavailable
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Public helper — clears the cooldown timestamp so the popup can show again. */
export function clearNewsletterCooldown() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Public helper — enables/disables persistent debug mode (force-show on every load). */
export function setNewsletterDebug(enabled: boolean) {
  try {
    if (enabled) window.localStorage.setItem(DEBUG_KEY, '1');
    else window.localStorage.removeItem(DEBUG_KEY);
  } catch {
    /* ignore */
  }
}

export function isNewsletterDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export default function NewsletterPopup() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false); // controls animation
  const [config, setConfig] = useState<PopupConfig>(DEFAULT_POPUP_CONFIG);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [debugForced, setDebugForced] = useState(false);

  const close = useCallback(() => {
    // In debug/force mode, don't persist a "seen" marker so the popup
    // can be reopened for repeated testing.
    if (!debugForced) markSeen();
    setVisible(false);
    // let fade-out play out before unmount
    window.setTimeout(() => setOpen(false), 250);
  }, [debugForced]);

  // Boot: fetch config, respect cooldown, respect existing subscriber
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flags = readDebugFlags();
    if (flags.reset) clearNewsletterCooldown();
    if (flags.force) setDebugForced(true);
    if (flags.force || flags.reset) {
      // Log once so a tester knows debug mode is active.
      console.info('[NewsletterPopup] debug mode:', flags);
    }

    (async () => {
      const cfg = await getPopupConfig();
      if (cancelled) return;
      setConfig(cfg);

      if (flags.force) {
        // Force-show immediately, bypass cooldown + subscribed checks + enabled flag.
        setOpen(true);
        requestAnimationFrame(() => setVisible(true));
        return;
      }

      if (!cfg.isEnabled) return;
      if (withinCooldown(cfg.cooldownDays)) return;

      const currentEmail = auth.currentUser?.email;
      if (currentEmail) {
        const already = await isEmailSubscribed(currentEmail);
        if (cancelled || already) return;
      }

      timer = setTimeout(() => {
        if (cancelled) return;
        setOpen(true);
        requestAnimationFrame(() => setVisible(true));
      }, Math.max(0, cfg.delaySeconds) * 1000);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Escape + focus management
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid email');
      return;
    }
    setSubmitting(true);
    const result = await subscribeToNewsletter(parsed.data, 'popup');
    setSubmitting(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setSuccess(true);
    markSeen();
    setTimeout(() => close(), 3000);
  };

  if (!open) return null;

  const hasImage = Boolean(config.imageUrl && config.imageUrl.trim());

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={close}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="newsletter-popup-title"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-[520px] bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden transition-all duration-300 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        } flex flex-col md:flex-row`}
      >
        <button
          ref={closeBtnRef}
          onClick={close}
          aria-label="Close newsletter popup"
          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {hasImage && (
          <div className="md:w-[180px] w-full flex-shrink-0 bg-slate-950">
            <img
              src={config.imageUrl!}
              alt=""
              className="w-full h-40 md:h-full object-cover md:rounded-l-2xl rounded-t-2xl md:rounded-tr-none"
              loading="eager"
            />
          </div>
        )}

        <div className={`flex-1 p-6 md:p-7 ${!hasImage ? 'text-center' : ''}`}>
          {success ? (
            <div className="flex flex-col items-center justify-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
              <h3 id="newsletter-popup-title" className="text-xl font-bold text-white mb-1">
                You're subscribed!
              </h3>
              <p className="text-sm text-slate-400 text-center">
                Check your inbox soon.
              </p>
            </div>
          ) : (
            <>
              <div className={`flex items-center gap-2 mb-2 ${!hasImage ? 'justify-center' : ''}`}>
                <Mail className="w-5 h-5 text-emerald-500" />
                <span className="text-xs uppercase tracking-wider text-emerald-500 font-semibold">
                  Newsletter
                </span>
              </div>
              <h3
                id="newsletter-popup-title"
                className="text-2xl font-bold text-white leading-tight"
              >
                {config.headline}
              </h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                {config.subheadline}
              </p>
              <form onSubmit={handleSubmit} className="mt-5 space-y-3">
                <label htmlFor="newsletter-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="newsletter-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter your email address"
                  disabled={submitting}
                  className="w-full min-h-[44px] px-4 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? 'newsletter-error' : undefined}
                />
                {error && (
                  <p id="newsletter-error" className="text-xs text-red-400" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Subscribing…
                    </>
                  ) : (
                    config.buttonText
                  )}
                </button>
                <p className="text-xs text-slate-500 text-center">
                  No spam. Unsubscribe anytime.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

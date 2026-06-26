import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Dismissable promo strip + "Start here" starter-product card for Google Ads
 * landing pages (/compound, /landing/phlabs).
 *
 * Ads-policy safe:
 *   - no molecule names, no medical claims
 *   - starter product is Bacteriostatic Water (laboratory reagent, not a peptide)
 *   - promo code LAB10 is a real, server-validated coupon in Firestore
 *
 * Dismissal persists in localStorage for 7 days.
 */

const PROMO_CODES = [
  { code: "SALE5", label: "5% off · min £20" },
  { code: "SALE10", label: "10% off · min £80 · free 3ml vial case 🎁" },
] as const;
const PROMO_HEADLINE = "Launch promo — save on your research order";
const DISMISS_KEY = "phl_landing_promo_dismissed_v2";
const DISMISS_DAYS = 7;

const STARTER_HREF = "/products/bacteriostatic-water-research-compound";
const STARTER_TITLE = "Bacteriostatic Water — Laboratory Diluent";
const STARTER_SUB = "0.9% Benzyl Alcohol · Reagent grade · For Research Use Only";
const STARTER_PRICE = "£6.99";

type Theme = "dark" | "light";

interface Props {
  /** dark = /compound · light = /landing/phlabs editorial */
  theme?: Theme;
}

export function LandingPromoStrip({ theme = "dark" }: Props) {
  const [hidden, setHidden] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const until = Number.parseInt(raw, 10);
        if (Number.isFinite(until) && until > Date.now()) return;
      }
    } catch {
      /* ignore */
    }
    setHidden(false);
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000),
      );
    } catch {
      /* ignore */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  if (hidden) return null;

  const dark = theme === "dark";
  const wrap = dark
    ? "bg-[#0a1024] border-b border-[#c9a44c]/40 text-white"
    : "bg-neutral-950 border-b border-[#b08a3e]/60 text-white";
  const codeBox = dark
    ? "border-[#c9a44c]/60 bg-[#c9a44c]/10 text-[#e6c986]"
    : "border-[#b08a3e]/70 bg-[#b08a3e]/15 text-[#e6c986]";
  const cta = dark
    ? "bg-[#c9a44c] text-[#060b18] hover:bg-[#e6c986]"
    : "bg-[#b08a3e] text-white hover:bg-[#8a6a2e]";

  return (
    <div
      role="region"
      aria-label="Launch promotion"
      className={`relative z-40 ${wrap}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] sm:text-[13px]">
        <span className="font-medium tracking-wide">{PROMO_HEADLINE}</span>
        <span className="opacity-70 hidden sm:inline">·</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy promo code ${PROMO_CODE}`}
          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[12px] tracking-[0.18em] uppercase transition-colors ${codeBox}`}
        >
          {PROMO_CODE}
          <span className="text-[10px] opacity-80">{copied ? "Copied" : "Copy"}</span>
        </button>
        <span className="opacity-70 hidden sm:inline">{PROMO_SUB}</span>
        <Link
          to={STARTER_HREF}
          className={`inline-flex items-center rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] font-medium transition-colors ${cta}`}
        >
          Start with {STARTER_PRICE} reagent →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss promotion"
          className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-base leading-none"
        >
          ×
        </button>
      </div>

      {/* Mobile-tappable starter card row (visible only on /landing/phlabs hero) */}
      <Link
        to={STARTER_HREF}
        className="sr-only"
        aria-label={`${STARTER_TITLE} — ${STARTER_PRICE}. ${STARTER_SUB}`}
      >
        {STARTER_TITLE} {STARTER_PRICE}
      </Link>
    </div>
  );
}

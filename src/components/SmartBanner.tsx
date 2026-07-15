import { useEffect, useState } from "react";
import {
  bannerConfig as defaultConfig,
  BANNER_SIZE_PADDING,
  DISMISS_STORAGE_KEY,
  type BannerConfig,
  type BannerPosition,
} from "@/config/banner.config";

interface SmartBannerProps {
  /** Optional override — useful for admin preview. Falls back to bannerConfig. */
  config?: Partial<BannerConfig>;
}

const DESKTOP_MIN_WIDTH = 1024;

function isHex(value: string): boolean {
  return typeof value === "string" && value.trim().startsWith("#");
}

function positionClasses(position: BannerPosition): string {
  switch (position) {
    case "top-left":
      return "top-6 left-6";
    case "bottom-right":
      return "bottom-6 right-6";
    case "bottom-left":
      return "bottom-6 left-6";
    case "top-right":
    default:
      return "top-6 right-6";
  }
}

function readDismissedAt(): number {
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function SmartBanner({ config }: SmartBannerProps = {}) {
  const cfg: BannerConfig = { ...defaultConfig, ...(config ?? {}) };

  const [isClient, setIsClient] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Determine viewport + dismissal state — client only.
  useEffect(() => {
    if (!isClient) return;
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const applyViewport = () => setIsDesktop(mq.matches);
    applyViewport();
    mq.addEventListener("change", applyViewport);
    return () => mq.removeEventListener("change", applyViewport);
  }, [isClient]);

  useEffect(() => {
    if (!isClient || !cfg.enabled) return;
    const dismissedAt = readDismissedAt();
    const stillHidden =
      dismissedAt > 0 &&
      Date.now() - dismissedAt < cfg.dismissDurationHours * 60 * 60 * 1000;
    if (stillHidden) {
      setDismissed(true);
      return;
    }

    if (isDesktop) {
      const delay = prefersReducedMotion() ? 0 : cfg.delayMs;
      const t = window.setTimeout(() => {
        setVisible(true);
        // Next frame → trigger enter transition.
        window.requestAnimationFrame(() => setEntered(true));
      }, delay);
      return () => window.clearTimeout(t);
    }

    // Mobile — mount inline immediately, fade in.
    setVisible(true);
    window.requestAnimationFrame(() => setEntered(true));
  }, [isClient, isDesktop, cfg.enabled, cfg.delayMs, cfg.dismissDurationHours]);

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (!isClient || !cfg.enabled || dismissed || !visible) return null;

  const bgIsHex = isHex(cfg.backgroundColor);
  const textIsHex = isHex(cfg.textColor);

  const containerStyle: React.CSSProperties = {};
  if (bgIsHex) containerStyle.backgroundColor = cfg.backgroundColor;
  if (textIsHex) containerStyle.color = cfg.textColor;

  const bgClass = !bgIsHex ? cfg.backgroundColor : "";
  const textClass = !textIsHex ? cfg.textColor : "";
  const paddingClass = BANNER_SIZE_PADDING[cfg.bannerSize];

  const reduce = prefersReducedMotion();
  const enterMs = reduce ? 0 : 400;

  const inner = (
    <>
      <div className="flex-1 min-w-0 pr-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span className="font-medium">{cfg.message}</span>
        {cfg.ctaLabel && cfg.ctaHref ? (
          <a
            href={cfg.ctaHref}
            className="underline underline-offset-2 font-semibold hover:opacity-90"
          >
            {cfg.ctaLabel} →
          </a>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        className="absolute top-3 right-3 inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 6l12 12M18 6L6 18"
          />
        </svg>
      </button>
    </>
  );

  if (isDesktop) {
    // Floating promo popup — fixed, non-blocking wrapper.
    return (
      <div
        aria-live="polite"
        className={`fixed z-[60] pointer-events-none ${positionClasses(cfg.position)}`}
        style={{ maxWidth: "min(420px, calc(100vw - 32px))" }}
      >
        <div
          role="region"
          aria-label="Promotional message"
          className={`relative pointer-events-auto rounded-2xl shadow-2xl border border-white/20 ${paddingClass} ${cfg.fontSize} ${bgClass} ${textClass}`}
          style={{
            ...containerStyle,
            maxWidth: 420,
            opacity: entered ? 1 : 0,
            transform: entered ? "translateY(0)" : "translateY(-20px)",
            transition: `opacity ${enterMs}ms ease-out, transform ${enterMs}ms ease-out`,
          }}
        >
          {inner}
        </div>
      </div>
    );
  }

  // Mobile — inline banner, flows in document.
  return (
    <div
      role="region"
      aria-label="Promotional message"
      className={`relative w-full ${paddingClass} ${cfg.fontSize} ${bgClass} ${textClass}`}
      style={{
        ...containerStyle,
        opacity: entered ? 1 : 0,
        transition: `opacity 300ms ease-out`,
      }}
    >
      {inner}
    </div>
  );
}

export default SmartBanner;

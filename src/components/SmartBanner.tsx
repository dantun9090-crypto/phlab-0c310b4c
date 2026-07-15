import { useEffect, useState } from "react";
import {
  BANNER_SIZE_PADDING,
  BANNER_SIZE_MAXWIDTH,
  DISMISS_STORAGE_KEY,
  type BannerConfig,
  type BannerPosition,
} from "@/config/banner.config";
import { useSmartBannerConfig } from "@/lib/smart-banner-config";

interface SmartBannerProps {
  /** Optional override — used by admin preview. When omitted, config is
   * loaded live from Firestore via useSmartBannerConfig(). */
  config?: BannerConfig;
  /** When true, bypass dismiss/localStorage/delay so the admin preview
   * always shows the banner. */
  previewMode?: boolean;
}

const DESKTOP_MIN_WIDTH = 1024;

function isHex(value: string): boolean {
  return typeof value === "string" && value.trim().startsWith("#");
}

function positionWrapperClasses(position: BannerPosition): string {
  switch (position) {
    case "center":
      return "inset-0 flex items-center justify-center";
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

export function SmartBanner({ config, previewMode = false }: SmartBannerProps = {}) {
  const liveCfg = useSmartBannerConfig();
  const cfg: BannerConfig = config ?? liveCfg;

  const [isClient, setIsClient] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [visible, setVisible] = useState(previewMode);
  const [entered, setEntered] = useState(previewMode);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => {
    if (!isClient) return;
    if (previewMode) { setIsDesktop(true); return; }
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [isClient, previewMode]);

  useEffect(() => {
    if (!isClient || previewMode) return;
    if (!cfg.enabled || !isDesktop) return;

    const dismissedAt = readDismissedAt();
    const stillHidden =
      dismissedAt > 0 &&
      Date.now() - dismissedAt < cfg.dismissDurationHours * 60 * 60 * 1000;
    if (stillHidden) { setDismissed(true); return; }

    const delay = prefersReducedMotion() ? 0 : cfg.delayMs;
    const t = window.setTimeout(() => {
      setVisible(true);
      window.requestAnimationFrame(() => setEntered(true));
    }, delay);
    return () => window.clearTimeout(t);
  }, [isClient, isDesktop, previewMode, cfg.enabled, cfg.delayMs, cfg.dismissDurationHours]);

  const handleDismiss = () => {
    if (!previewMode) {
      try { window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now())); } catch { /* ignore */ }
    }
    setDismissed(true);
  };

  // Desktop-only. Mobile: never render.
  if (!previewMode && (!isClient || !isDesktop)) return null;
  if (!cfg.enabled || dismissed || !visible) return null;

  const bgIsHex = isHex(cfg.backgroundColor);
  const textIsHex = isHex(cfg.textColor);
  const containerStyle: React.CSSProperties = {};
  if (bgIsHex) containerStyle.backgroundColor = cfg.backgroundColor;
  if (textIsHex) containerStyle.color = cfg.textColor;
  const bgClass = !bgIsHex ? cfg.backgroundColor : "";
  const textClass = !textIsHex ? cfg.textColor : "";
  const paddingClass = BANNER_SIZE_PADDING[cfg.bannerSize];
  const maxW = BANNER_SIZE_MAXWIDTH[cfg.bannerSize];

  const reduce = !previewMode && prefersReducedMotion();
  const enterMs = reduce ? 0 : 400;
  const isCenter = cfg.position === "center";

  const wrapperPositionClass = previewMode
    ? "relative"
    : `fixed ${positionWrapperClasses(cfg.position)}`;

  return (
    <div
      aria-live="polite"
      className={`${wrapperPositionClass} z-[60] ${previewMode ? "" : "pointer-events-none"} ${isCenter && !previewMode ? "bg-black/40 backdrop-blur-sm" : ""}`}
      style={
        previewMode
          ? undefined
          : { maxWidth: isCenter ? undefined : `min(${maxW + 40}px, calc(100vw - 32px))` }
      }
    >
      <div
        role="region"
        aria-label="Promotional message"
        className={`relative ${previewMode ? "" : "pointer-events-auto"} rounded-2xl shadow-2xl border border-white/20 ${paddingClass} ${cfg.fontSize} ${bgClass} ${textClass}`}
        style={{
          ...containerStyle,
          maxWidth: maxW,
          width: isCenter ? "100%" : undefined,
          opacity: entered ? 1 : 0,
          transform: entered ? "translateY(0) scale(1)" : (isCenter ? "scale(0.96)" : "translateY(-20px)"),
          transition: `opacity ${enterMs}ms ease-out, transform ${enterMs}ms ease-out`,
        }}
      >
        <div className="flex-1 min-w-0 pr-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center">
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
          className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default SmartBanner;

export type BannerFontSize =
  | "text-xs"
  | "text-sm"
  | "text-base"
  | "text-lg"
  | "text-xl"
  | "text-2xl";

export type BannerSize = "compact" | "normal" | "large";

export type BannerPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

export interface BannerConfig {
  /** Message shown inside the banner. */
  message: string;
  /** Optional CTA link — when set, renders an inline link inside the banner. */
  ctaLabel?: string;
  ctaHref?: string;
  /** Hex color (e.g. "#2563EB") or a Tailwind bg-* class. */
  backgroundColor: string;
  /** Hex color or a Tailwind text-* class. */
  textColor: string;
  fontSize: BannerFontSize;
  bannerSize: BannerSize;
  /** Delay before showing the desktop popup (ms). */
  delayMs: number;
  /** How long to keep the banner hidden after user dismisses it. */
  dismissDurationHours: number;
  /** Desktop popup anchor. Ignored on mobile (inline). */
  position: BannerPosition;
  /** Master switch. When false, the banner never mounts. */
  enabled: boolean;
}

export const BANNER_SIZE_PADDING: Record<BannerSize, string> = {
  compact: "py-2 px-4",
  normal: "py-3 px-6",
  large: "py-4 px-8",
};

export const bannerConfig: BannerConfig = {
  message: "Launch promo — save on your research order. Use code SALE10.",
  ctaLabel: "Shop research peptides",
  ctaHref: "/products",
  backgroundColor: "#2563EB",
  textColor: "#FFFFFF",
  fontSize: "text-base",
  bannerSize: "normal",
  delayMs: 2000,
  dismissDurationHours: 24,
  position: "top-right",
  enabled: true,
};

export const DISMISS_STORAGE_KEY = "phl_banner_dismissed";

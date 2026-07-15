export type BannerFontSize =
  | "text-xs"
  | "text-sm"
  | "text-base"
  | "text-lg"
  | "text-xl"
  | "text-2xl";

export type BannerSize = "compact" | "normal" | "large";

export type BannerPosition =
  | "center"
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

export interface BannerConfig {
  message: string;
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
  /** Desktop popup anchor. Desktop-only — mobile never renders. */
  position: BannerPosition;
  /** Master switch. When false, the banner never mounts. */
  enabled: boolean;
}

export const BANNER_SIZE_PADDING: Record<BannerSize, string> = {
  compact: "py-3 px-5",
  normal: "py-5 px-7",
  large: "py-7 px-10",
};

export const BANNER_SIZE_MAXWIDTH: Record<BannerSize, number> = {
  compact: 420,
  normal: 520,
  large: 640,
};

export const FONT_SIZE_OPTIONS: BannerFontSize[] = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
];

export const BANNER_SIZE_OPTIONS: BannerSize[] = ["compact", "normal", "large"];

export const BANNER_POSITION_OPTIONS: BannerPosition[] = [
  "center",
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
];

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
  position: "center",
  enabled: true,
};

export const DISMISS_STORAGE_KEY = "phl_banner_dismissed";

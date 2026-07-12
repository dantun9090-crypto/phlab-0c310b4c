/**
 * Cloudflare Image Resizing helper.
 *
 * Routes Firebase Storage (and a few other allowlisted) image URLs through
 * the `/_img` Worker endpoint (cloudflare/worker.js), which calls
 * `fetch(src, { cf: { image: { ... } } })` to deliver AVIF/WebP variants
 * negotiated from the client `Accept` header.
 *
 * Same-origin (`/_img/...`) so the existing CSP `img-src 'self'` covers it.
 */

const ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "lh3.googleusercontent.com",
]);

export interface CfImageOpts {
  width?: number;
  /** "auto" lets CF pick AVIF/WebP/jpeg from Accept. */
  format?: "auto" | "avif" | "webp" | "jpeg" | "png";
  quality?: number;
  fit?: "cover" | "contain" | "scale-down" | "crop" | "pad";
}

function canTransform(src: string): boolean {
  if (!src) return false;
  if (src.startsWith("data:") || src.startsWith("blob:")) return false;
  if (src.startsWith("/")) return false;
  try {
    const u = new URL(src);
    return ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Single transformed URL. Falls back to the original if it can't transform. */
export function cfImg(src: string | undefined | null, opts: CfImageOpts = {}): string {
  if (!src || !canTransform(src)) return src || "";
  const params = new URLSearchParams();
  params.set("u", src);
  if (opts.width) params.set("w", String(Math.round(opts.width)));
  params.set("f", opts.format || "auto");
  // q=85 is the project-wide default (AVIF/WebP at 85 is visually
  // indistinguishable from 90 and ~15-25% smaller — matters on mobile).
  params.set("q", String(opts.quality ?? 85));
  if (opts.fit) params.set("fit", opts.fit);
  return `/_img?${params.toString()}`;
}

/** Build a responsive srcset string for a set of widths. */
export function cfSrcSet(
  src: string | undefined | null,
  widths: number[],
  opts: Omit<CfImageOpts, "width"> = {},
): string | undefined {
  if (!src || !canTransform(src)) return undefined;
  return widths
    .map((w) => `${cfImg(src, { ...opts, width: w })} ${w}w`)
    .join(", ");
}

/** Convenience: returns { src, srcSet, sizes } props ready to spread on <img>. */
export function cfImgProps(
  src: string | undefined | null,
  opts: {
    widths?: number[];
    sizes?: string;
    quality?: number;
    fit?: CfImageOpts["fit"];
    /** Width used for the fallback `src`. Defaults to a mid-size candidate
     *  (not the widest) so bots and legacy clients that ignore srcset
     *  don't pay for the 1600/1920 hero variant on a phone. */
    fallbackWidth?: number;
  } = {},
): { src: string; srcSet?: string; sizes?: string } {
  // Include narrow-mobile widths (360, 480) so 360 CSS-px viewports at
  // DPR=1/2 don't over-fetch. Modern devices at DPR=3 still pick 1280+
  // via srcset — the browser matches the smallest candidate ≥ CSS×DPR.
  const widths = opts.widths ?? [360, 480, 640, 900, 1200, 1600];
  // Fallback is the middle candidate, not the widest. Real browsers
  // will use srcset anyway; this only affects legacy/no-srcset consumers.
  const midIdx = Math.floor(widths.length / 2);
  const fallback = opts.fallbackWidth ?? widths[midIdx];
  if (!src || !canTransform(src)) return { src: src || "" };
  return {
    src: cfImg(src, { width: fallback, quality: opts.quality, fit: opts.fit }),
    srcSet: cfSrcSet(src, widths, { quality: opts.quality, fit: opts.fit }),
    sizes: opts.sizes,
  };
}

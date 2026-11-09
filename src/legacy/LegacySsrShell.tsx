import type { CSSProperties } from "react";
import { cfImgProps } from "@/lib/cf-image";
import type { PromoBannerLite } from "@/lib/firestore-rest";

/**
 * Static home hero shell — no browser APIs and only pure, dependency-free
 * imports (cf-image is pure URL building, no window/document), so it stays
 * safe for the SSR worker bundle AND for the client pre-mount window.
 *
 * Two render paths:
 *  1. SSR (TanStack index route "/") — HomeSsrFallback renders this into
 *     the served HTML, so the hero text exists from first paint
 *     (previously an empty shell, which is why mobile LCP on / sat at
 *     ~7–10s: nothing painted until the full CSR boot, and the LCP element
 *     ended up being a 10px disclaimer paragraph).
 *  2. Client chunk-load window — rendered while the LegacyApp chunk is
 *     still downloading, so the hero paints immediately after entry eval.
 *
 * The hero footprint + skeleton grid mirror the real Home layout to keep
 * CLS at ~0 when React swaps in the live component.
 *
 * Optional `banner`: when the route loader resolved the active promo banner
 * (SSR fetch with a 300 ms budget), the shell renders the REAL banner <img>
 * at the top with geometry identical to src/pages/Home/index.tsx. The banner
 * is the mobile LCP element — the <link rel="preload"> already fetched the
 * bytes early, but the PAINT still waited for the full CSR boot (~5–7s on
 * mobile). Painting it straight from SSR HTML removes that wait; the swap
 * into the live component reuses the same preloaded candidate at the same
 * size, so CLS stays at ~0.
 */
export function LegacySsrShell({ banner }: { banner?: PromoBannerLite | null } = {}) {
  // Same gating as `bannerVisible` in src/pages/Home/index.tsx.
  const activeBanner =
    banner &&
    typeof banner.imageUrl === "string" &&
    banner.imageUrl.length > 0 &&
    banner.active !== false &&
    banner.isActive !== false
      ? banner
      : null;

  // Same height math as Home: admin heightPx is the mobile baseline, wider
  // viewports scale with 22vw, capped at half of max(heightPx, 560).
  const baseH = activeBanner?.heightPx || 320;
  const capH = Math.max(baseH, 560);
  const desktopCap = Math.round(capH / 2);
  const mobileMin = Math.round(baseH * 0.7);
  const responsiveHeight = `clamp(${mobileMin}px, 22vw, ${desktopCap}px)`;

  const rawHref = (activeBanner?.ctaUrl || activeBanner?.linkUrl || "").trim();
  const bannerHref =
    rawHref.startsWith("/") || /^https?:\/\//i.test(rawHref) ? rawHref : "";

  const bannerImg = activeBanner ? (
    <img
      {...cfImgProps(activeBanner.imageUrl, {
        // Mirror src/pages/Home/index.tsx and the preload in
        // src/routes/index.tsx EXACTLY so the browser reuses the preloaded
        // candidate instead of double-fetching.
        widths: [480, 640, 800, 1024, 1280, 1600, 1920],
        sizes: "(max-width: 640px) 100vw, (max-width: 1280px) 100vw, 1600px",
        quality: 78,
        fallbackWidth: 1280,
      })}
      alt={
        activeBanner.altText ||
        "PH Labs research peptides — homepage hero banner"
      }
      width={1600}
      height={desktopCap}
      fetchPriority="high"
      style={{
        width: "100%",
        height: responsiveHeight,
        objectFit:
          (activeBanner.objectFit as CSSProperties["objectFit"]) || "cover",
        objectPosition: `${activeBanner.objectPositionX ?? 50}% ${activeBanner.objectPositionY ?? 50}%`,
        display: "block",
      }}
    />
  ) : null;

  return (
    <div
      className="phl-ssr-shell"
      aria-hidden="false"
      // Transient dark pre-hydration paint — keep its native dark colors
      // in day mode too (it unmounts as soon as React takes over).
      data-keep-dark
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#f0f8ff',
        // Explicit system sans stack — without it the pre-CSS paint falls
        // back to the browser default serif and the hero H1 visibly flashes
        // (this exact bug killed a previous SSR shell attempt).
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* Real promo banner painted with the first HTML frame (LCP). The
          decorative overlays/gradient/edge-fades from the live component are
          intentionally skipped — they are absolutely positioned, so they do
          not affect layout and pop in with the React swap. */}
      {bannerImg ? (
        <div
          data-home-promo-banner
          style={{
            position: "relative",
            width: "100%",
            overflow: "hidden",
            minHeight: responsiveHeight,
          }}
        >
          {bannerHref ? (
            <a href={bannerHref} style={{ display: "block" }}>
              {bannerImg}
            </a>
          ) : (
            bannerImg
          )}
        </div>
      ) : null}

      {/* Static hero shell — paints LCP text without waiting for JS chunks.
          React replaces this with the real Home component once mounted. */}
      <section
        style={{
          position: 'relative',
          padding: '80px 16px 48px',
          maxWidth: 1280,
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 999,
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.25)',
                color: '#4ade80',
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              UK Laboratory Reagent Supplier · Research Use Only
            </span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(1.75rem, 7.5vw, 4.2rem)',
              fontWeight: 900,
              lineHeight: 1.04,
              color: '#f0f8ff',
              margin: 0,
            }}
          >
            <span style={{ display: 'block' }}>Tested Research Peptides UK</span>
            <span style={{ display: 'block', color: '#10b981' }}>Retatrutide · MOTS-C · GHK-Cu</span>
            <span
              style={{
                display: 'block',
                color: '#c9d8f0',
                fontWeight: 400,
                fontSize: '0.72em',
              }}
            >
              HPLC-Verified ≥99% Purity · CoA Per Batch
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.05rem',
              lineHeight: 1.75,
              color: '#9cb8d9',
              maxWidth: 480,
              margin: 0,
            }}
          >
            PH Labs supplies tested research peptides and analytical-grade laboratory reagents to qualified UK researchers — including retatrutide, MOTS-C, GHK-Cu and bacteriostatic water, held in UK stock. Every batch is HPLC and mass-spectrometry verified with a Certificate of Analysis.{' '}
            <strong style={{ color: '#f0a0a0' }}>
              Research Use Only — Not For Human Consumption.
            </strong>
          </p>

          {/* Banner skeleton — occupies real hero footprint to prevent CLS */}
          <div
            aria-hidden="true"
            style={{
              marginTop: 24,
              width: '100%',
              aspectRatio: '16 / 9',
              maxWidth: 960,
              borderRadius: 12,
              background:
                'linear-gradient(90deg, rgba(15,23,42,0.6) 0%, rgba(30,41,59,0.6) 50%, rgba(15,23,42,0.6) 100%)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          />
        </div>
      </section>

      {/* Product grid skeleton */}
      <section style={{ padding: '48px 16px', maxWidth: 1280, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gap: 24,
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}
        >
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                height: 320,
                borderRadius: 12,
                background:
                  'linear-gradient(180deg, rgba(15,23,42,0.6) 0%, rgba(30,41,59,0.6) 100%)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            />
          ))}
        </div>
      </section>

      <span className="sr-only" style={{ position: 'absolute', left: -9999 }} aria-live="polite">
        Loading PH Labs…
      </span>
    </div>
  );
}

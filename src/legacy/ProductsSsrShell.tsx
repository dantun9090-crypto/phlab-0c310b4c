import { FlaskConical, Microscope, ShieldCheck, Truck } from "lucide-react";

/**
 * Static first-paint shell for /products (SSR HTML + pre-mount window).
 *
 * Mirrors the hero of src/pages/Products/index.tsx ("all" category) with
 * the SAME classes, inline styles and copy, so the hero intro paragraph —
 * the mobile LCP element — paints from the server HTML at the exact size it
 * has in the live page. When React swaps in the live page, the replacement
 * paragraph is the same size, so LCP stays at first paint instead of
 * waiting for the full app boot (~9s on throttled mobile).
 *
 * Keep the copy below in sync with CATEGORY_INTROS.all in the Products page.
 * Pure markup only: no router, no browser APIs (safe for the SSR worker).
 */
export function ProductsSsrShell() {
  return (
    <div
      className="phl-ssr-shell min-h-screen"
      data-keep-dark
      // Same font stack ThemeContext applies to <body> after mount, so the
      // hero paragraph wraps identically before and after the React swap.
      style={{ background: "#060f1e", fontFamily: 'var(--theme-font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)' }}
    >
      <section
        className="relative overflow-hidden"
        style={{ background: "#030812", paddingTop: "calc(var(--nav-h, 80px) + 2rem)", paddingBottom: "4rem" }}
      >
        <div className="hero-top-shimmer pointer-events-none" />
        <div
          className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, #060f1e)" }}
        />

        <div className="container mx-auto px-6 relative z-10">
          <nav className="flex items-center gap-2 mb-6 text-xs" style={{ color: "#3a5a82" }} aria-label="Breadcrumb">
            <a href="/" className="hover:text-blue-400 transition-colors">Home</a>
            <span>/</span>
            <span style={{ color: "#9cb8d9" }}>Catalogue</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-2xl">
              <div
                className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full"
                style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(96,165,250,0.2)" }}
              >
                <FlaskConical className="w-3.5 h-3.5 text-blue-400" />
                <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#60a5fa" }}>
                  Compound Catalogue
                </span>
              </div>

              <h1
                className="font-black leading-tight mb-3"
                style={{ fontSize: "clamp(2rem, 4.5vw, 3.25rem)", color: "#eef4ff", letterSpacing: "-0.025em" }}
              >
                Research Peptides UK — Third-Party Tested, UK Stock
              </h1>
              <p className="leading-relaxed text-base" style={{ color: "#9cb8d9", maxWidth: 560 }}>
                HPLC-tested, research-grade lyophilised peptides. Every batch analytically verified to ≥99% purity by reverse-phase HPLC and confirmed by mass spectrometry. Certificate of Analysis included. For laboratory research use only.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:flex-col lg:items-end lg:gap-2 shrink-0">
              {[
                { icon: ShieldCheck, text: "≥99% HPLC Verified", color: "#10b981" },
                { icon: Microscope, text: "CoA Every Order", color: "#3b82f6" },
                { icon: Truck, text: "UK Same-Day Dispatch", color: "#a78bfa" },
              ].map(({ icon: Icon, text, color }) => (
                <div
                  key={text}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                  <span className="text-xs font-semibold" style={{ color: "#9ab8d8" }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-4" style={{ background: "#04101f", borderBottom: "1px solid rgba(16,185,129,0.08)" }}>
        <div className="container mx-auto px-6">
          <p className="text-xs text-center leading-relaxed" style={{ color: "#2a6645", maxWidth: 760, margin: "0 auto" }}>
            <strong style={{ color: "#10b981" }}>Research Use Only.</strong>{" "}
            All products are strictly for laboratory research. Not for human or veterinary consumption. Not intended to diagnose, treat, cure or prevent any disease. Not evaluated by MHRA or FDA. 18+ only.
          </p>
        </div>
      </section>

      <section className="py-10">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden"
                style={{ background: "#0b1a30", border: "1px solid rgba(255,255,255,0.05)", minHeight: "420px" }}
              >
                <div style={{ aspectRatio: "4/3", background: "#0d1f3a" }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <span className="sr-only" aria-live="polite">Loading PH Labs…</span>
    </div>
  );
}

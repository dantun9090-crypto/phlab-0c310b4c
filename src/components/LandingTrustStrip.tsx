/**
 * LandingTrustStrip
 *
 * Eye-catching trust bar for /compound and /landing/phlabs landing pages.
 * Pattern derived from Semrush SERP analysis of "research peptides uk":
 * top-ranking UK competitors (uk-peptides.com, tidelabs.co.uk,
 * researchpeptide.co.uk) all surface the same 4 conversion signals high
 * above the fold — purity %, HPLC/UKAS verification, same-day UK dispatch,
 * batch documentation. We mirror that proven layout.
 *
 * Two themes:
 *   - dark  → /compound  (slate-950 + emerald accent)
 *   - light → /landing/phlabs (cream + gold accent)
 */

type Theme = "dark" | "light";

interface Item {
  big: string;
  label: string;
  sub: string;
}

const ITEMS: Item[] = [
  { big: "99%+", label: "HPLC-tested purity", sub: "Independent lab analysis" },
  { big: "UK", label: "Same-day dispatch", sub: "Order before 3pm GMT" },
  { big: "CoA", label: "Every batch documented", sub: "Certificate of Analysis included" },
  { big: "−20°C", label: "Cold-chain handled", sub: "Type 1 glass · reagent grade" },
];

export function LandingTrustStrip({ theme = "dark" }: { theme?: Theme }) {
  const isDark = theme === "dark";

  const wrap = isDark
    ? "bg-gradient-to-r from-[#08111f] via-[#0d1a30] to-[#08111f] border-y border-emerald-500/20"
    : "bg-white border-y border-[#b08a3e]/30";

  const big = isDark ? "text-emerald-400" : "text-[#b08a3e]";
  const label = isDark ? "text-white" : "text-neutral-900";
  const sub = isDark ? "text-slate-400" : "text-neutral-600";
  const divider = isDark ? "md:border-emerald-500/15" : "md:border-[#b08a3e]/20";

  return (
    <section
      aria-label="PH Labs quality guarantees"
      className={`w-full ${wrap}`}
      data-component="landing-trust-strip"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-0">
          {ITEMS.map((it, i) => (
            <li
              key={it.big}
              className={[
                "py-5 md:py-6 px-3 md:px-6 text-center",
                i > 0 ? `border-l border-transparent ${divider}` : "",
                i === 2 ? "md:border-l" : "",
                "border-t md:border-t-0",
                i < 2 ? "md:border-t-0" : "",
                isDark ? "border-emerald-500/10" : "border-[#b08a3e]/15",
              ].join(" ")}
            >
              <div className={`text-2xl md:text-3xl font-bold tracking-tight ${big}`}>
                {it.big}
              </div>
              <div className={`mt-1 text-xs md:text-sm font-semibold uppercase tracking-wider ${label}`}>
                {it.label}
              </div>
              <div className={`mt-1 text-[11px] md:text-xs ${sub}`}>{it.sub}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

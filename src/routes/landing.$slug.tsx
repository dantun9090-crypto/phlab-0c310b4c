import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db, doc, getDoc } from "@/lib/firebase";

interface Stat { value: string; label: string }
interface Feature { icon: string; title: string; desc: string }
interface LandingPageData {
  heroBadge: string;
  heroHeading: string;
  heroSubheading: string;
  heroCta: string;
  heroCtaUrl: string;
  heroImageUrl: string;
  stats: Stat[];
  features: Feature[];
  trustBullets: string[];
  ctaHeading: string;
  ctaSubtext: string;
  ctaButton: string;
  ctaButtonUrl: string;
  ctaBgColor: string;
  pageTitle: string;
  metaDescription: string;
  pageSlug: string;
  published: boolean;
}

export const Route = createFileRoute("/landing/$slug")({
  component: DynamicLanding,
  notFoundComponent: () => (
    <div className="min-h-screen bg-[#060f1e] flex flex-col items-center justify-center text-center p-8">
      <h1 className="text-3xl font-bold text-white mb-3">Landing page not found</h1>
      <p className="text-[#9cb8d9] mb-6">This landing page is unpublished or the URL is incorrect.</p>
      <Link to="/" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
        Go to homepage
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-[#060f1e] flex flex-col items-center justify-center text-center p-8">
      <h1 className="text-2xl font-bold text-white mb-3">Could not load landing page</h1>
      <p className="text-[#9cb8d9] text-sm">{error.message}</p>
    </div>
  ),
});

function DynamicLanding() {
  const { slug } = Route.useParams();
  const [data, setData] = useState<LandingPageData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "siteSettings", "landingPage"));
        if (cancelled) return;
        if (!snap.exists()) { setState("missing"); return; }
        const d = snap.data() as LandingPageData;
        if (d.pageSlug !== slug || !d.published) { setState("missing"); return; }
        setData(d);
        setState("ready");
        if (typeof document !== "undefined") {
          if (d.pageTitle) document.title = d.pageTitle;
          if (d.metaDescription) {
            let m = document.querySelector('meta[name="description"]');
            if (!m) {
              m = document.createElement("meta");
              m.setAttribute("name", "description");
              document.head.appendChild(m);
            }
            m.setAttribute("content", d.metaDescription);
          }
        }
      } catch (err) {
        console.error("Landing page load error", err);
        if (!cancelled) setState("missing");
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (state === "loading") {
    return <div className="min-h-screen bg-[#060f1e] flex items-center justify-center text-[#9cb8d9]">Loading…</div>;
  }
  if (state === "missing" || !data) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex flex-col items-center justify-center text-center p-8">
        <h1 className="text-3xl font-bold text-white mb-3">Landing page not found</h1>
        <p className="text-[#9cb8d9] mb-2">No published landing page at <span className="font-mono">/landing/{slug}</span>.</p>
        <p className="text-[#9cb8d9] text-sm mb-6">If you're the admin, open Admin → Landing Page Builder and either change the slug to match, or publish the page.</p>
        <Link to="/" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
          Go to homepage
        </Link>
      </div>
    );
  }

  return (
    <main className="bg-[#060f1e] min-h-screen text-white">
      <section className="px-6 md:px-12 py-16 md:py-24 max-w-6xl mx-auto">
        <div className="space-y-5">
          {data.heroBadge && (
            <span className="inline-block px-3 py-1 bg-blue-500/15 border border-blue-500/30 rounded-full text-blue-300 text-xs font-semibold">
              {data.heroBadge}
            </span>
          )}
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">{data.heroHeading}</h1>
          <p className="text-[#9cb8d9] text-lg md:text-xl max-w-2xl">{data.heroSubheading}</p>
          {data.heroCta && data.heroCtaUrl && (
            <a
              href={data.heroCtaUrl}
              className="inline-block mt-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
            >
              {data.heroCta}
            </a>
          )}
        </div>
        {data.heroImageUrl && (
          <img
            src={data.heroImageUrl}
            alt=""
            loading="lazy"
            className="mt-10 w-full rounded-2xl border border-white/10"
          />
        )}
      </section>

      {data.stats?.length > 0 && (
        <section className="px-6 md:px-12 py-10 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {data.stats.map((s, i) => (
              <div key={i} className="bg-[#0b1a30] border border-white/10 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-blue-400">{s.value}</div>
                <div className="text-sm text-[#9cb8d9] mt-2">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.features?.length > 0 && (
        <section className="px-6 md:px-12 py-12 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.features.map((f, i) => (
              <div key={i} className="bg-[#0b1a30] border border-white/10 rounded-xl p-6">
                <div className="text-3xl mb-3" aria-hidden>{f.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-[#9cb8d9] text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.trustBullets?.length > 0 && (
        <section className="px-6 md:px-12 py-12 max-w-3xl mx-auto">
          <ul className="space-y-3">
            {data.trustBullets.map((b, i) => (
              <li key={i} className="flex gap-3 text-[#e8f0fc]">
                <span className="text-blue-400">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="px-6 md:px-12 py-16 mt-8"
        style={{ backgroundColor: data.ctaBgColor || "#0b1a30" }}
      >
        <div className="max-w-3xl mx-auto text-center space-y-5">
          <h2 className="text-3xl md:text-4xl font-bold">{data.ctaHeading}</h2>
          <p className="text-[#9cb8d9] text-lg">{data.ctaSubtext}</p>
          {data.ctaButton && data.ctaButtonUrl && (
            <a
              href={data.ctaButtonUrl}
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
            >
              {data.ctaButton}
            </a>
          )}
        </div>
      </section>

      <p className="text-center text-xs text-[#9cb8d9] py-6">For Research Use Only. Not for Human Consumption.</p>
    </main>
  );
}

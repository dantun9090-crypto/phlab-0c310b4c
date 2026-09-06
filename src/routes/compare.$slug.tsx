/**
 * Programmatic SEO route — /compare/{slug}
 *
 * Renders long-tail comparison pages from src/lib/programmatic-seo.ts.
 * Each page gets:
 *   - Unique <title>, meta description, canonical, OG/Twitter tags
 *   - Article + FAQPage JSON-LD
 *   - Compliance-safe wording (research use only, no medical claims)
 *   - Internal links into the per-peptide hub categories
 *
 * Sitemap inclusion lives in src/routes/sitemap[.]xml.ts.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";
import {
  findProgrammaticPage,
  profileOf,
  relatedComparisons,
  type ProgrammaticPage,
} from "@/lib/programmatic-seo";

function titleFor(p: ProgrammaticPage): string {
  // "BPC-157 vs TB-500 | PH Labs Research" — keep ≤ 60 chars.
  const base = `${p.left.name} vs ${p.right.name}`;
  const suffix = " | PH Labs Research";
  if (base.length + suffix.length <= 60) return base + suffix;
  const room = 60 - " | PH Labs".length;
  return base.slice(0, room) + " | PH Labs";
}

export const Route = createFileRoute("/compare/$slug")({
  loader: ({ params }) => {
    const page = findProgrammaticPage(params.slug);
    if (!page) throw notFound();
    return { page };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.page) return { meta: [{ title: "Not found | PH Labs" }] };
    const p = loaderData.page;
    const title = titleFor(p);
    const url = `${SITE_URL}/compare/${p.slug}`;
    const articleLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${p.left.name} vs ${p.right.name} — research comparison`,
      description: p.metaDescription,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "PH Labs UK" },
      publisher: { "@type": "Organization", name: "PH Labs UK" },
      datePublished: p.updated,
      dateModified: p.updated,
    };
    const faqLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };
    return {
      meta: [
        { title },
        { name: "description", content: p.metaDescription },
        { name: "robots", content: "index,follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: p.metaDescription },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: p.metaDescription },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(articleLd) },
        { type: "application/ld+json", children: JSON.stringify(faqLd) },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-8">
      <h1 className="text-3xl font-bold text-white mb-3">Comparison not found</h1>
      <p className="text-slate-400 mb-6">
        No programmatic comparison at this URL.
      </p>
      <Link
        to="/products"
        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg"
      >
        Browse research products
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-8">
      <h1 className="text-2xl font-bold text-white mb-3">
        Could not load comparison
      </h1>
      <p className="text-slate-400 text-sm">{error.message}</p>
    </div>
  ),
  component: ComparePage,
});

function ComparePage() {
  const { page: p } = Route.useLoaderData() as { page: ProgrammaticPage };
  const leftProfile = profileOf(p.left);
  const rightProfile = profileOf(p.right);
  const related = relatedComparisons(p.slug);
  return (
    <main className="bg-slate-950 min-h-screen text-white">
      <article className="max-w-5xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <nav className="text-xs text-slate-400 mb-6" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-emerald-400">
            Home
          </Link>{" "}
          ›{" "}
          <Link to="/products" className="hover:text-emerald-400">
            Research products
          </Link>{" "}
          › <span className="text-slate-300">{p.left.name} vs {p.right.name}</span>
        </nav>

        <header className="space-y-4 mb-10">
          <span className="inline-block px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-300 text-xs font-semibold">
            Research peptide comparison · For Research Use Only
          </span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight">
            {p.left.name} <span className="text-slate-500">vs</span> {p.right.name}
          </h1>
          <p className="text-slate-300 text-lg max-w-3xl">{p.intro}</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {[p.left, p.right].map((side) => (
            <div
              key={side.slug + side.name}
              className="bg-slate-900 border border-slate-700 rounded-xl p-6"
            >
              <h2 className="text-xl font-semibold mb-1">{side.name}</h2>
              <p className="text-xs uppercase tracking-wide text-emerald-400 mb-4">
                {side.family}
              </p>
              <ul className="space-y-2 text-slate-300 text-sm">
                {side.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <a
                href={`/products/category/${side.slug}`}
                className="inline-block mt-5 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Browse {side.name} research vials →
              </a>
            </div>
          ))}
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-5">At a glance</h2>
          <div className="overflow-x-auto border border-slate-700 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="text-left px-4 py-3">Attribute</th>
                  <th className="text-left px-4 py-3">{p.left.name}</th>
                  <th className="text-left px-4 py-3">{p.right.name}</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                <tr className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-400">Family</td>
                  <td className="px-4 py-3">{p.left.family}</td>
                  <td className="px-4 py-3">{p.right.family}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-400">Chemical class</td>
                  <td className="px-4 py-3">{leftProfile.chemClass}</td>
                  <td className="px-4 py-3">{rightProfile.chemClass}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-400">Approx. molecular weight</td>
                  <td className="px-4 py-3">{leftProfile.mw}</td>
                  <td className="px-4 py-3">{rightProfile.mw}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-400">Standard diluent</td>
                  <td className="px-4 py-3">{leftProfile.diluent}</td>
                  <td className="px-4 py-3">{rightProfile.diluent}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-400">Typical assay panels</td>
                  <td className="px-4 py-3">{leftProfile.assays}</td>
                  <td className="px-4 py-3">{rightProfile.assays}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-400">Use</td>
                  <td className="px-4 py-3">Research use only</td>
                  <td className="px-4 py-3">Research use only</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-400">Storage</td>
                  <td className="px-4 py-3">{leftProfile.storage}</td>
                  <td className="px-4 py-3">{rightProfile.storage}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-5">
            How researchers separate {p.left.name} and {p.right.name}
          </h2>
          <div className="space-y-4 text-slate-300 text-sm leading-relaxed max-w-3xl">
            <p>
              {p.left.name} sits in the {p.left.family.toLowerCase()} group.{" "}
              {leftProfile.researchContext} In practical laboratory terms it is a{" "}
              {leftProfile.chemClass.toLowerCase()} with an approximate molecular weight of{" "}
              {leftProfile.mw}, normally reconstituted with {leftProfile.diluent.toLowerCase()} and held at{" "}
              {leftProfile.storage}.
            </p>
            <p>
              {p.right.name} belongs to the {p.right.family.toLowerCase()} group instead.{" "}
              {rightProfile.researchContext} It is a {rightProfile.chemClass.toLowerCase()} with an
              approximate molecular weight of {rightProfile.mw}, reconstituted with{" "}
              {rightProfile.diluent.toLowerCase()} and stored at {rightProfile.storage}.
            </p>
            <p>
              Because the two differ in mass and class, concentration calculations are not
              interchangeable: the same diluent volume produces a different molar concentration for
              each compound, which matters whenever a study compares them side by side. Assay
              selection also differs — {p.left.name} is typically characterised through{" "}
              {leftProfile.assays.toLowerCase()}, whereas {p.right.name} is usually assessed through{" "}
              {rightProfile.assays.toLowerCase()}.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-5">Quality control and documentation</h2>
          <div className="space-y-4 text-slate-300 text-sm leading-relaxed max-w-3xl">
            <p>
              Every batch of {p.left.name} and {p.right.name} supplied by PH Labs is released against
              third-party HPLC purity analysis with mass-spectrometry identity confirmation. The
              certificate of analysis records batch number, purity by peak area, retention time and
              analysis date, so a laboratory can tie any result back to the exact vial used.
            </p>
            <p>
              Vials are shipped lyophilised from the UK. On arrival, researchers commonly log batch
              and expiry details, reconstitute according to their own protocol, and record
              post-reconstitution storage conditions — the largest source of variability between
              repeat experiments is handling, not the compound itself.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-5">Frequently asked</h2>
          <div className="space-y-3">
            {p.faqs.map((f, i) => (
              <details
                key={i}
                className="bg-slate-900 border border-slate-700 rounded-lg p-4 group"
              >
                <summary className="cursor-pointer font-semibold text-white list-none flex justify-between gap-3">
                  {f.q}
                  <span className="text-emerald-400 group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <p className="text-slate-300 text-sm mt-3 leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {related.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-5">Related comparisons</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <a
                    href={`/compare/${r.slug}`}
                    className="block bg-slate-900 border border-slate-700 hover:border-emerald-500 rounded-lg px-4 py-3 text-sm font-semibold text-slate-200"
                  >
                    {r.left.name} vs {r.right.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="bg-slate-900 border border-slate-700 rounded-xl p-6 md:p-8 mb-8">
          <h2 className="text-xl font-bold mb-3">Related research catalogue</h2>
          <p className="text-slate-300 text-sm mb-4">
            Browse the full UK research-use-only catalogue, or jump straight to
            either compound in this comparison.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/products/category/${p.left.slug}`}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"
            >
              {p.left.name} research vials
            </a>
            <a
              href={`/products/category/${p.right.slug}`}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"
            >
              {p.right.name} research vials
            </a>
            <Link
              to="/products"
              className="px-4 py-2 border border-slate-600 hover:border-emerald-500 rounded-lg text-sm font-semibold"
            >
              All research products
            </Link>
          </div>
        </section>

        <p className="text-center text-xs text-slate-500 py-6">
          For Research Use Only. Not for Human Consumption. PH Labs supplies
          research compounds to UK laboratories only.
        </p>
      </article>
    </main>
  );
}

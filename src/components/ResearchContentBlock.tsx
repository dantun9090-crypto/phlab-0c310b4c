import { FlaskConical, Beaker, Snowflake, ShieldCheck, FileText, Link2, Atom, Activity, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { RESEARCH_CONTENT, type ResearchContent } from "@/lib/research-content";

interface ResearchContentBlockProps {
  slug: string;
}

/**
 * Renders the 6-section research-only content block on product pages
 * when a matching slug exists in RESEARCH_CONTENT. Pure presentational —
 * no business logic, no API calls. Returns null for slugs without
 * authored content so the existing generic FAQ/specs render as fallback.
 */
export function ResearchContentBlock({ slug }: ResearchContentBlockProps) {
  const content: ResearchContent | undefined = RESEARCH_CONTENT[slug];
  if (!content) return null;

  const Section = ({
    icon: Icon,
    title,
    children,
  }: {
    icon: typeof FlaskConical;
    title: string;
    children: React.ReactNode;
  }) => (
    <div
      className="border border-white/[0.07] rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
      style={{ background: "#0b1a30" }}
    >
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-400" />
        </div>
        <h2 className="font-bold text-[#f0f6ff] text-sm tracking-wide">{title}</h2>
        <span className="ml-auto px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[10px] font-bold tracking-[0.15em] uppercase">
          Research Use Only
        </span>
      </div>
      <div className="px-6 py-5 text-[#9cb8d9] text-sm leading-relaxed">{children}</div>
    </div>
  );

  return (
    <section aria-labelledby="research-content-heading" className="mt-12 space-y-5 max-w-4xl">
      <h2 id="research-content-heading" className="sr-only">
        Research-grade reference information
      </h2>

      <Section icon={FlaskConical} title="Research Overview">
        <p>{content.overview}</p>
      </Section>

      <Section icon={Beaker} title="Laboratory Applications">
        <p>{content.applications}</p>
      </Section>

      <Section icon={Snowflake} title="Preparation &amp; Storage">
        <p>{content.prepStorage}</p>
      </Section>

      <Section icon={ShieldCheck} title="Quality Verification">
        <p>{content.qualityVerification}</p>
      </Section>

      <Section icon={FileText} title="Research FAQ">
        <dl className="space-y-4">
          {content.faqs.map((f, i) => (
            <div key={i}>
              <dt className="text-[#d0e4f8] font-semibold text-sm mb-1">{f.q}</dt>
              <dd className="text-[#9cb8d9] text-sm leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section icon={Link2} title="Related Research Compounds">
        <ul className="grid sm:grid-cols-2 gap-3">
          {content.related.map((r) => (
            <li key={r.slug}>
              <Link
                to="/products/$slug"
                params={{ slug: r.slug }}
                className="block p-3.5 rounded-xl bg-blue-600/[0.06] border border-blue-500/15 hover:border-blue-500/40 hover:bg-blue-600/[0.1] transition-colors"
              >
                <span className="block text-[#d0e4f8] font-semibold text-sm">{r.label}</span>
                <span className="block text-[#7a99c0] text-xs mt-1 leading-relaxed">{r.relationship}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </section>
  );
}

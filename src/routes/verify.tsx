/**
 * Public lab-test verification page — `/verify`.
 *
 * Three modes:
 *   /verify                     → search + product tiles
 *   /verify?batch=ZE300902      → single batch card
 *   /verify?product=TIRZEPATIDE → every published test for one product
 *
 * Data is read client-side with the browser Supabase client, so switching a
 * row to "public" in the admin panel makes it visible immediately without a
 * rebuild. RLS only exposes rows where `is_public = true`.
 *
 * Link policy: this is a NEW route. No product URL, slug, canonical or feed
 * link elsewhere on the site is changed by this page.
 */
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { safeJsonLd } from "@/lib/safe-json-ld";
import {
  type LabTest,
  SHOP_LAB_PRODUCTS,
  SHOP_LAB_PRODUCT_LABELS,
  LAB_SOURCE_CLASS,
  PURITY_TIER_CLASS,
  purityTier,
  formatMass,
  formatPurity,
  formatTestDate,
  toShopProductKey,
} from "@/lib/lab-tests";

// Plain <a>: keeps the page safe if it is ever mounted outside the TanStack
// router (same reasoning as /uk-research-store).
function A({ to, ...rest }: { to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={to} {...rest} />;
}

const TITLE = "Lab Test Verification | Batch Purity Reports | PH Labs";
const DESCRIPTION =
  "Verify the independent laboratory analysis for any PH Labs batch — net mass, HPLC purity and a direct link to the analytical report. For Research Use Only.";
const URL = "https://phlabs.co.uk/verify";
const RUO = "For Research Use Only. Not for Human Consumption.";

const FAQS = [
  {
    q: "Are PH Labs materials laboratory tested?",
    a: "Yes. Each batch is analysed by an independent analytical laboratory (Janoshik, Chromate or CuriousChems) for net mass and HPLC purity.",
  },
  {
    q: "Where can I see the analytical results?",
    a: "Enter the batch code printed on the vial label on this page. The record shows net mass, purity and a direct link to the report hosted by the laboratory.",
  },
  {
    q: "What does the purity figure represent?",
    a: "It is the HPLC purity reported by the independent laboratory for the analysed sample of that batch, expressed as a percentage of total peak area.",
  },
];

interface VerifySearch {
  batch?: string;
  product?: string;
}

export const Route = createFileRoute("/verify")({
  validateSearch: (search: Record<string, unknown>): VerifySearch => ({
    batch: typeof search.batch === "string" ? search.batch : undefined,
    product: typeof search.product === "string" ? search.product : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: safeJsonLd({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: VerifyPage,
});

const SELECT_COLUMNS =
  "id, product, label_mg, batch, cap_color, test_date, mass_1, purity_1, mass_2, purity_2, avg_mass, avg_purity, test_link, lab_source, is_public, created_at, updated_at";

function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function VerifyPage() {
  const { batch, product } = Route.useSearch();
  const hydrated = useHydrated();

  const batchQuery = useQuery({
    queryKey: ["lab-tests", "batch", batch],
    enabled: hydrated && !!batch,
    staleTime: 60_000,
    queryFn: async (): Promise<LabTest[]> => {
      const { data, error } = await supabase
        .from("lab_tests")
        .select(SELECT_COLUMNS)
        .ilike("batch", batch!)
        .order("test_date", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LabTest[];
    },
  });

  const productKey = product ? (toShopProductKey(product) ?? product.toUpperCase()) : undefined;

  const productQuery = useQuery({
    queryKey: ["lab-tests", "product", productKey],
    enabled: hydrated && !!productKey && !batch,
    staleTime: 60_000,
    queryFn: async (): Promise<LabTest[]> => {
      const { data, error } = await supabase
        .from("lab_tests")
        .select(SELECT_COLUMNS)
        .eq("product", productKey!)
        .order("test_date", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LabTest[];
    },
  });

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <A to="/" className="text-sm text-emerald-400 hover:underline">
            ← PH Labs
          </A>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Lab Test Verification</h1>
          <p className="mt-2 max-w-2xl text-slate-300">
            Every batch is analysed by an independent laboratory. Enter a batch code or choose a product to view the
            reported net mass, HPLC purity and the original analytical report.
          </p>
        </header>

        {batch ? (
          <BatchView batch={batch} query={batchQuery} />
        ) : productKey ? (
          <ProductView productKey={productKey} query={productQuery} />
        ) : (
          <SearchView />
        )}

        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">How verification works</h2>
          <p className="mt-2 text-sm text-slate-300">
            Each batch of our research materials is analysed by an independent analytical laboratory (Janoshik,
            Chromate, CuriousChems). Open the report link to confirm the result directly at source.
          </p>
          <dl className="mt-4 space-y-3">
            {FAQS.map((f) => (
              <div key={f.q}>
                <dt className="text-sm font-semibold text-white">{f.q}</dt>
                <dd className="text-sm text-slate-400">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-8 text-center text-xs uppercase tracking-wide text-slate-400">{RUO}</p>
      </div>
    </main>
  );
}

/* ─────────────────────────────── Mode 1 ─────────────────────────────── */

interface QueryLike {
  data?: LabTest[];
  isLoading: boolean;
  isError: boolean;
}

function BatchView({ batch, query }: { batch: string; query: QueryLike }) {
  if (query.isLoading) return <Skeleton />;
  if (query.isError)
    return <Notice title="Verification temporarily unavailable" body="Please try again in a moment." />;

  const test = query.data?.[0];
  if (!test)
    return (
      <Notice
        title="No test found for this batch"
        body="Check the batch code printed on the vial label, or contact us and we will send the report."
        action={{ href: "/contact", label: "Contact us" }}
      />
    );

  const tier = purityTier(test.avg_purity);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">
            {SHOP_LAB_PRODUCT_LABELS[test.product] ?? test.product}
            {test.label_mg ? ` ${test.label_mg} mg` : ""}
          </h2>
          <p className="mt-1 font-mono text-lg text-slate-200">Batch {test.batch}</p>
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full border px-4 py-2 text-xl font-bold ${PURITY_TIER_CLASS[tier]}`}>
            {formatPurity(test.avg_purity)}
          </span>
          <p className="mt-1 text-xs text-slate-400">Average HPLC purity</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <Field label="Test date" value={formatTestDate(test.test_date)} />
        <Field label="Cap / crimp colour" value={<CapColour value={test.cap_color} />} />
        <Field
          label="Laboratory"
          value={
            test.lab_source ? (
              <span
                className={`rounded-full border px-2 py-1 text-xs ${LAB_SOURCE_CLASS[test.lab_source] ?? "border-slate-600 bg-slate-800 text-slate-300"}`}
              >
                {test.lab_source}
              </span>
            ) : (
              "—"
            )
          }
        />
      </dl>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left">Measurement</th>
              <th className="px-3 py-2 text-left">Sample 1</th>
              <th className="px-3 py-2 text-left">Sample 2</th>
              <th className="px-3 py-2 text-left">Average</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800">
              <th scope="row" className="px-3 py-2 text-left font-normal text-slate-400">
                Net mass
              </th>
              <td className="px-3 py-2">{formatMass(test.mass_1)}</td>
              <td className="px-3 py-2">{test.mass_2 == null ? "—" : formatMass(test.mass_2)}</td>
              <td className="px-3 py-2 font-semibold">{formatMass(test.avg_mass)}</td>
            </tr>
            <tr className="border-t border-slate-800">
              <th scope="row" className="px-3 py-2 text-left font-normal text-slate-400">
                Purity
              </th>
              <td className="px-3 py-2">{formatPurity(test.purity_1)}</td>
              <td className="px-3 py-2">{test.purity_2 == null ? "—" : formatPurity(test.purity_2)}</td>
              <td className="px-3 py-2 font-semibold">{formatPurity(test.avg_purity)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {test.test_link && (
          <a
            href={test.test_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] items-center rounded-lg bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-500"
          >
            View full lab report
          </a>
        )}
        <A
          to={`/verify?product=${encodeURIComponent(test.product)}`}
          className="inline-flex min-h-[48px] items-center rounded-lg border-2 border-slate-700 px-5 text-slate-200 hover:bg-slate-800"
        >
          All tests for this product
        </A>
        <span className="rounded-full border border-emerald-600/50 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          Verified by an independent laboratory
        </span>
      </div>
      <p className="mt-4 text-xs text-slate-500">Batch reference: {batch}</p>
    </section>
  );
}

/* ─────────────────────────────── Mode 2 ─────────────────────────────── */

function ProductView({ productKey, query }: { productKey: string; query: QueryLike }) {
  if (query.isLoading) return <Skeleton />;
  if (query.isError)
    return <Notice title="Verification temporarily unavailable" body="Please try again in a moment." />;

  const tests = query.data ?? [];
  const label = SHOP_LAB_PRODUCT_LABELS[productKey] ?? productKey;

  if (tests.length === 0)
    return (
      <Notice
        title={`No published tests for ${label} yet`}
        body="Reports are published as each batch is analysed. Contact us for the current batch record."
        action={{ href: "/contact", label: "Contact us" }}
      />
    );

  return (
    <section>
      <h2 className="text-2xl font-bold">Lab tests: {label}</h2>
      <p className="mt-1 text-sm text-slate-400">
        {tests.length} published test{tests.length === 1 ? "" : "s"}, newest first.
      </p>
      <ul className="mt-4 space-y-3">
        {tests.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
          >
            <span className="text-sm text-slate-300">{formatTestDate(t.test_date)}</span>
            <span className="font-mono text-sm text-slate-200">{t.batch ?? "—"}</span>
            {t.label_mg && <span className="text-sm text-slate-400">{t.label_mg} mg</span>}
            <span
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${PURITY_TIER_CLASS[purityTier(t.avg_purity)]}`}
            >
              {formatPurity(t.avg_purity)}
            </span>
            <div className="ml-auto flex gap-2">
              {t.test_link && (
                <a
                  href={t.test_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center rounded-lg border-2 border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Lab report
                </a>
              )}
              {t.batch && (
                <A
                  to={`/verify?batch=${encodeURIComponent(t.batch)}`}
                  className="inline-flex min-h-[40px] items-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Batch details
                </A>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────────── Mode 3 ─────────────────────────────── */

function SearchView() {
  const hydrated = useHydrated();
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(input.trim()), 300);
    return () => window.clearTimeout(id);
  }, [input]);

  const suggestions = useQuery({
    queryKey: ["lab-tests", "search", term],
    enabled: hydrated && term.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<LabTest[]> => {
      const { data, error } = await supabase
        .from("lab_tests")
        .select(SELECT_COLUMNS)
        .or(`batch.ilike.%${term}%,product.ilike.%${term}%`)
        .order("test_date", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LabTest[];
    },
  });

  const rows = useMemo(() => suggestions.data ?? [], [suggestions.data]);

  return (
    <section>
      <label className="block">
        <span className="text-sm text-slate-300">Enter a product name or batch code</span>
        <input
          className="mt-2 min-h-[52px] w-full rounded-xl border-2 border-slate-700 bg-slate-900 px-4 text-lg text-white placeholder:text-slate-500"
          placeholder="e.g. TIRZEPATIDE or ZE300902"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Search lab tests by product or batch code"
        />
      </label>

      {term.length >= 2 && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-2">
          {suggestions.isLoading && <p className="p-2 text-sm text-slate-400">Searching…</p>}
          {!suggestions.isLoading && rows.length === 0 && (
            <p className="p-2 text-sm text-slate-400">No published tests match that search.</p>
          )}
          <ul>
            {rows.map((t) => (
              <li key={t.id}>
                <A
                  to={t.batch ? `/verify?batch=${encodeURIComponent(t.batch)}` : `/verify?product=${encodeURIComponent(t.product)}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-800"
                >
                  <span className="text-sm text-white">{SHOP_LAB_PRODUCT_LABELS[t.product] ?? t.product}</span>
                  <span className="font-mono text-xs text-slate-300">{t.batch ?? "—"}</span>
                  <span className="ml-auto text-xs text-slate-400">{formatPurity(t.avg_purity)}</span>
                </A>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mt-10 text-lg font-semibold">Browse by product</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SHOP_LAB_PRODUCTS.map((p) => (
          <li key={p}>
            <A
              to={`/verify?product=${encodeURIComponent(p)}`}
              className="block rounded-xl border border-slate-800 bg-slate-900 p-4 hover:border-emerald-600"
            >
              <span className="font-semibold text-white">{SHOP_LAB_PRODUCT_LABELS[p] ?? p}</span>
              <span className="mt-1 block text-xs text-slate-400">View published batch tests</span>
            </A>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────────── Shared ─────────────────────────────── */

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-100">{value}</dd>
    </div>
  );
}

const COLOUR_DOTS: Record<string, string> = {
  BLACK: "#0f172a",
  WHITE: "#f8fafc",
  BLUE: "#3b82f6",
  GREEN: "#10b981",
  RED: "#ef4444",
  GOLD: "#d4af37",
  SILVER: "#cbd5e1",
  YELLOW: "#facc15",
  ORANGE: "#f97316",
  PURPLE: "#a855f7",
  PINK: "#ec4899",
  GREY: "#94a3b8",
  GRAY: "#94a3b8",
};

function CapColour({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  const parts = value.split(/[/,+]/).map((p) => p.trim()).filter(Boolean);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {parts.map((p) => {
        const hex = COLOUR_DOTS[p.toUpperCase()];
        return (
          <span key={p} className="inline-flex items-center gap-1">
            {hex && (
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full border border-slate-600"
                style={{ backgroundColor: hex }}
              />
            )}
            {p}
          </span>
        );
      })}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading test data">
      <div className="h-28 rounded-2xl bg-slate-900" />
      <div className="h-40 rounded-2xl bg-slate-900" />
    </div>
  );
}

function Notice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-slate-300">{body}</p>
      {action && (
        <A
          to={action.href}
          className="mt-4 inline-flex min-h-[48px] items-center rounded-lg bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-500"
        >
          {action.label}
        </A>
      )}
    </section>
  );
}

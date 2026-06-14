import { CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

const BRAND = 'PH Labs';
const CURRENCY = 'GBP';
const GOOGLE_CATEGORY_ID = '6975';
const GOOGLE_CATEGORY_NAME = 'Business & Industrial > Science & Laboratory > Biochemicals';

interface PreviewProduct {
  name?: string;
  slug?: string;
  category?: string;
  purity?: string;
  price?: number;
  sku?: string;
  excludeFromMerchantFeed?: boolean;
  includeInMerchantFeed?: boolean;
}

interface FeedEntry {
  included: boolean;
  title: string;
  description: string;
  link: string;
  price: string;
  brand: string;
  category: string;
  productType: string;
  skuMpn: string;
}

function buildFeedEntry(product: PreviewProduct): FeedEntry {
  const name = product.name?.trim() || 'Product Name';
  const slug = product.slug?.trim() || 'product-slug';
  const purity = product.purity?.trim();
  const price = typeof product.price === 'number' ? product.price : 0;
  return {
    included: product.includeInMerchantFeed === true && product.excludeFromMerchantFeed !== true && !(product.name || '').toLowerCase().includes('tirzepatide'),
    title: `Laboratory Reference Standard — ${name} (Research Chemical, RUO, Not For Human Use)`,
    description:
      `Analytical-grade laboratory reference standard supplied by ${BRAND} UK for in-vitro chemistry research and assay calibration. ` +
      `${purity ? `HPLC-verified purity ${purity}. ` : ''}` +
      `Sold strictly as a research chemical to qualified laboratories and research professionals. Not a medicine, drug, dietary supplement, food, cosmetic or consumer product. Not for human or veterinary administration, ingestion, injection, inhalation or topical use. No therapeutic, nutritional, weight-management, hormonal or performance claims are made or implied.`,
    link: `https://phlabs.co.uk/products/${slug}`,
    price: `${price.toFixed(2)} ${CURRENCY}`,
    brand: BRAND,
    category: `${GOOGLE_CATEGORY_ID} (${GOOGLE_CATEGORY_NAME})`,
    productType: `${GOOGLE_CATEGORY_NAME}${product.category ? ` > ${product.category}` : ''}`,
    skuMpn: product.sku?.trim() || slug,
  };
}

/**
 * Mirrors the title/description/category logic in
 * src/routes/google-merchant-feed[.]xml.ts so admins can verify what will
 * be submitted to Google Merchant Center before saving — and see a diff
 * against the currently-saved feed entry.
 */
export function MerchantFeedPreview({
  product,
  baseline,
}: {
  product: PreviewProduct;
  baseline?: PreviewProduct | null;
}) {
  const next = buildFeedEntry(product);
  const prev = baseline ? buildFeedEntry(baseline) : null;

  const fields: Array<{ label: string; key: keyof FeedEntry; mono?: boolean; multiline?: boolean; meta?: (v: string) => { meta: string; status: 'ok' | 'warn' } }> = [
    {
      label: 'Title',
      key: 'title',
      meta: (v) => {
        const ok = v.length >= 30 && v.length <= 150;
        return { meta: `${v.length} chars · Google range 30–150`, status: ok ? 'ok' : 'warn' };
      },
    },
    {
      label: 'Description',
      key: 'description',
      multiline: true,
      meta: (v) => {
        const ok = v.length >= 70 && v.length <= 5000;
        return { meta: `${v.length} chars · Google range 70–5000`, status: ok ? 'ok' : 'warn' };
      },
    },
    { label: 'Link', key: 'link', mono: true },
    { label: 'Price', key: 'price', mono: true },
    { label: 'Brand', key: 'brand', mono: true },
    { label: 'g:google_product_category', key: 'category', mono: true },
    { label: 'g:product_type', key: 'productType', mono: true },
    { label: 'g:sku / g:mpn', key: 'skuMpn', mono: true },
  ];

  const fieldLabels: Record<string, string> = {
    included: 'Feed inclusion',
    ...Object.fromEntries(fields.map((f) => [f.key as string, f.label])),
  };
  const changedKeys = prev
    ? (['included', ...fields.map((f) => f.key)] as Array<keyof FeedEntry>).filter(
        (k) => String(prev[k]) !== String(next[k]),
      )
    : [];
  const hasDiff = !!prev && changedKeys.length > 0;

  return (
    <div className="bg-gray-800/40 border border-white/[0.07] rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            Google Merchant Feed Preview
          </h3>
          <p className="text-gray-600 text-xs mt-0.5">
            {prev
              ? hasDiff
                ? `${changedKeys.length} field${changedKeys.length === 1 ? '' : 's'} will change on save`
                : 'No changes — feed entry is identical to the saved version'
              : 'New product — full entry shown below'}
          </p>
        </div>
        {next.included ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/15 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Will be submitted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-500/15 text-red-300 px-2.5 py-1 rounded-full border border-red-500/30">
            <AlertCircle className="w-3 h-3" /> Excluded from feed
          </span>
        )}
      </div>

      {hasDiff && (
        <div className="sticky top-2 z-10 px-4 py-3 rounded-lg bg-amber-500/15 border border-amber-500/40 shadow-lg backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200 mb-2">
            Zmienione pola ({changedKeys.length})
          </p>
          <ol className="space-y-2 text-xs">
            {changedKeys.map((k, i) => {
              const prevRaw = k === 'included' ? (prev![k] ? 'submitted' : 'excluded') : String(prev![k] ?? '');
              const nextRaw = k === 'included' ? (next[k] ? 'submitted' : 'excluded') : String(next[k] ?? '');
              const shortPrev = prevRaw.length > 80 ? prevRaw.slice(0, 77) + '…' : prevRaw;
              const shortNext = nextRaw.length > 80 ? nextRaw.slice(0, 77) + '…' : nextRaw;
              return (
                <li key={k as string} className="flex items-start gap-2">
                  <span className="text-amber-400/70 font-mono text-[10px] mt-0.5 shrink-0 w-4">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-amber-100">
                      {fieldLabels[k as string] ?? (k as string)}
                      <span className="ml-1.5 font-mono text-[10px] font-normal text-amber-300/60">({k as string})</span>
                    </div>
                    <div className="mt-0.5 flex items-start gap-1.5 flex-wrap text-[11px]">
                      <span className="font-mono text-red-300/80 line-through decoration-red-400/50 break-all">{shortPrev || '(empty)'}</span>
                      <ArrowRight className="w-3 h-3 text-amber-300/70 shrink-0 mt-0.5" />
                      <span className="font-mono text-emerald-200 break-all">{shortNext || '(empty)'}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {prev && prev.included !== next.included && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <ArrowRight className="w-3.5 h-3.5" />
          Feed inclusion changing: <span className="font-mono">{prev.included ? 'submitted' : 'excluded'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
          <span className="font-mono">{next.included ? 'submitted' : 'excluded'}</span>
        </div>
      )}

      <dl className="text-xs space-y-2.5">
        {fields.map((f) => {
          const nextVal = next[f.key] as string;
          const prevVal = prev ? (prev[f.key] as string) : null;
          const changed = prev != null && prevVal !== nextVal;
          const metaInfo = f.meta ? f.meta(nextVal) : undefined;
          return (
            <DiffField
              key={f.key as string}
              label={f.label}
              prev={prevVal}
              next={nextVal}
              changed={changed}
              mono={f.mono}
              multiline={f.multiline}
              meta={metaInfo?.meta}
              status={metaInfo?.status}
            />
          );
        })}
      </dl>
    </div>
  );
}

function DiffField({
  label,
  prev,
  next,
  changed,
  meta,
  mono,
  multiline,
  status,
}: {
  label: string;
  prev: string | null;
  next: string;
  changed: boolean;
  meta?: string;
  mono?: boolean;
  multiline?: boolean;
  status?: 'ok' | 'warn';
}) {
  const cellClass = `mt-1 px-3 py-2 rounded-lg border ${
    mono ? 'font-mono text-[11px]' : 'text-xs'
  } ${multiline ? 'whitespace-pre-wrap leading-relaxed' : 'break-all'}`;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
          {label}
          {changed && (
            <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
              changed
            </span>
          )}
        </dt>
        {meta && (
          <span className={`text-[10px] ${status === 'warn' ? 'text-amber-400' : 'text-white/40'}`}>
            {meta}
          </span>
        )}
      </div>
      {changed && prev !== null ? (
        <div className="mt-1 space-y-1">
          <dd className={`${cellClass} bg-red-950/40 border-red-500/30 text-red-200/90 line-through decoration-red-500/40`}>
            {prev || '(empty)'}
          </dd>
          <dd className={`${cellClass} bg-emerald-950/40 border-emerald-500/30 text-emerald-100`}>
            {next || '(empty)'}
          </dd>
        </div>
      ) : (
        <dd className={`${cellClass} bg-gray-900/60 border-white/[0.05] text-white/90`}>{next}</dd>
      )}
    </div>
  );
}

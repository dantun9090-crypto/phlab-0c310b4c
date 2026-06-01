import { CheckCircle2, AlertCircle } from 'lucide-react';

const BRAND = 'PH Labs';
const CURRENCY = 'GBP';
const GOOGLE_CATEGORY_ID = '499954';
const GOOGLE_CATEGORY_NAME = 'Laboratory Chemicals > Research Reference Standards';

interface PreviewProduct {
  name?: string;
  slug?: string;
  category?: string;
  purity?: string;
  price?: number;
  sku?: string;
  excludeFromMerchantFeed?: boolean;
}

/**
 * Mirrors the title/description/category logic in
 * src/routes/google-merchant-feed[.]xml.ts so admins can verify what will
 * be submitted to Google Merchant Center before saving.
 */
export function MerchantFeedPreview({ product }: { product: PreviewProduct }) {
  const name = product.name?.trim() || 'Product Name';
  const slug = product.slug?.trim() || 'product-slug';
  const purity = product.purity?.trim();
  const price = typeof product.price === 'number' ? product.price : 0;
  const excluded = product.excludeFromMerchantFeed === true;

  const title = `Laboratory Reference Standard — ${name} (Research Chemical, RUO, Not For Human Use)`;
  const description =
    `Analytical-grade laboratory reference standard supplied by ${BRAND} UK for in-vitro chemistry research and assay calibration. ` +
    `${purity ? `HPLC-verified purity ${purity}. ` : ''}` +
    `Sold strictly as a research chemical to qualified laboratories and research professionals. Not a medicine, drug, dietary supplement, food, cosmetic or consumer product. Not for human or veterinary administration, ingestion, injection, inhalation or topical use. No therapeutic, nutritional, weight-management, hormonal or performance claims are made or implied.`;
  const link = `https://www.phlabs.co.uk/products/${slug}`;
  const productType = `${GOOGLE_CATEGORY_NAME}${product.category ? ` > ${product.category}` : ''}`;

  const titleLen = title.length;
  const titleOk = titleLen >= 30 && titleLen <= 150;
  const descLen = description.length;
  const descOk = descLen >= 70 && descLen <= 5000;

  return (
    <div className="bg-gray-800/40 border border-white/[0.07] rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            Google Merchant Feed Preview
          </h3>
          <p className="text-gray-600 text-xs mt-0.5">
            How this product will appear in the XML feed submitted to Google
          </p>
        </div>
        {excluded ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-500/15 text-red-300 px-2.5 py-1 rounded-full border border-red-500/30">
            <AlertCircle className="w-3 h-3" /> Excluded from feed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/15 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Will be submitted
          </span>
        )}
      </div>

      <dl className="text-xs space-y-2.5">
        <Field label="Title" value={title} status={titleOk ? 'ok' : 'warn'} meta={`${titleLen} chars · Google range 30–150`} />
        <Field label="Description" value={description} status={descOk ? 'ok' : 'warn'} meta={`${descLen} chars · Google range 70–5000`} multiline />
        <Field label="Link" value={link} mono />
        <Field label="Price" value={`${price.toFixed(2)} ${CURRENCY}`} mono />
        <Field label="Brand" value={BRAND} mono />
        <Field label="g:google_product_category" value={`${GOOGLE_CATEGORY_ID} (${GOOGLE_CATEGORY_NAME})`} mono />
        <Field label="g:product_type" value={productType} mono />
        <Field label="g:sku / g:mpn" value={product.sku?.trim() || slug} mono />
        <Field label="g:condition / g:availability" value="new · in stock (live stock at submit)" mono />
      </dl>
    </div>
  );
}

function Field({
  label,
  value,
  meta,
  mono,
  multiline,
  status,
}: {
  label: string;
  value: string;
  meta?: string;
  mono?: boolean;
  multiline?: boolean;
  status?: 'ok' | 'warn';
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</dt>
        {meta && (
          <span className={`text-[10px] ${status === 'warn' ? 'text-amber-400' : 'text-white/40'}`}>
            {meta}
          </span>
        )}
      </div>
      <dd
        className={`mt-1 px-3 py-2 rounded-lg bg-gray-900/60 border border-white/[0.05] text-white/90 ${
          mono ? 'font-mono text-[11px]' : 'text-xs'
        } ${multiline ? 'whitespace-pre-wrap leading-relaxed' : 'break-all'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * "Certificates & lab testing" block on the product page.
 *
 * Renders only when the product has at least one PUBLISHED batch test in the
 * `lab_tests` table. Links to the public verification page `/verify?product=…`
 * — a new URL; the product's own URL/slug/canonical is untouched.
 */
import { useEffect, useState } from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toShopProductKey, verifyProductUrl } from '@/lib/lab-tests';

interface Props {
  /** Shop product name, e.g. "TB-500 (Thymosin Beta-4)". */
  productName: string;
}

export function LabTestBadge({ productName }: Props) {
  const productKey = toShopProductKey(productName);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!productKey) return;
    let alive = true;
    void (async () => {
      try {
        const { count: c, error } = await supabase
          .from('lab_tests')
          .select('id', { count: 'exact', head: true })
          .eq('product', productKey);
        if (!alive || error) return;
        setCount(c ?? 0);
      } catch {
        /* verification block is additive — stay silent on failure */
      }
    })();
    return () => {
      alive = false;
    };
  }, [productKey]);

  if (!productKey || !count) return null;

  // Relative link keeps the badge working on every host the app serves.
  const href = verifyProductUrl(productKey).replace(/^https?:\/\/[^/]+/, '');

  return (
    <section className="mt-3 rounded-2xl border border-emerald-600/30 bg-emerald-500/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Certificates &amp; lab testing
      </h2>
      <p className="mt-1 text-xs text-slate-300">
        {count} published batch {count === 1 ? 'analysis' : 'analyses'} from an independent laboratory — net mass and
        HPLC purity, with a link to the original report.
      </p>
      <a
        href={href}
        className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        View lab test results <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-slate-400">
        For Research Use Only. Not for Human Consumption.
      </p>
    </section>
  );
}

export default LabTestBadge;

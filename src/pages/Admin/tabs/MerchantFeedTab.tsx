import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ExternalLink, Copy, CheckCircle2, AlertTriangle, XCircle, Download, Eye } from 'lucide-react';

const FEED_URL = '/google-merchant-feed.xml';
const PUBLIC_FEED_URL = 'https://www.phlabs.co.uk/google-merchant-feed.xml';

interface ParsedItem {
  id: string;
  title: string;
  link: string;
  description: string;
  image_link: string;
  availability: string;
  price: string;
  brand: string;
  condition: string;
  google_product_category: string;
  product_type: string;
  identifier_exists: string;
  sku: string;
  mpn: string;
  gtin: string;
}

const REQUIRED_FIELDS: Array<keyof ParsedItem> = [
  'id', 'title', 'link', 'description', 'image_link',
  'availability', 'price', 'brand', 'condition',
];

function textOf(el: Element | null, tag: string, ns?: string): string {
  if (!el) return '';
  const node = ns
    ? el.getElementsByTagNameNS(ns, tag)[0]
    : el.getElementsByTagName(tag)[0];
  return (node?.textContent ?? '').trim();
}

const G_NS = 'http://base.google.com/ns/1.0';

function parseFeed(xml: string): { items: ParsedItem[]; channelTitle: string; error?: string } {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const parseErr = doc.getElementsByTagName('parsererror')[0];
    if (parseErr) return { items: [], channelTitle: '', error: parseErr.textContent || 'XML parse error' };
    const channel = doc.getElementsByTagName('channel')[0];
    const channelTitle = textOf(channel, 'title');
    const items = Array.from(doc.getElementsByTagName('item')).map((it): ParsedItem => ({
      id: textOf(it, 'id', G_NS),
      title: textOf(it, 'title'),
      link: textOf(it, 'link'),
      description: textOf(it, 'description'),
      image_link: textOf(it, 'image_link', G_NS),
      availability: textOf(it, 'availability', G_NS),
      price: textOf(it, 'price', G_NS),
      brand: textOf(it, 'brand', G_NS),
      condition: textOf(it, 'condition', G_NS),
      google_product_category: textOf(it, 'google_product_category', G_NS),
      product_type: textOf(it, 'product_type', G_NS),
      identifier_exists: textOf(it, 'identifier_exists', G_NS),
      sku: textOf(it, 'sku', G_NS),
      mpn: textOf(it, 'mpn', G_NS),
      gtin: textOf(it, 'gtin', G_NS),
    }));
    return { items, channelTitle };
  } catch (e: any) {
    return { items: [], channelTitle: '', error: e?.message || 'parse failed' };
  }
}

function validateItem(item: ParsedItem): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const f of REQUIRED_FIELDS) {
    if (!item[f]) errors.push(`Missing required field: ${f}`);
  }
  if (item.title && item.title.length > 150) errors.push(`title > 150 chars (${item.title.length})`);
  if (item.title && item.title.length < 15) warnings.push(`title short (${item.title.length} chars)`);
  if (item.description && item.description.length > 5000) errors.push(`description > 5000 chars`);
  if (item.description && item.description.length < 70) warnings.push(`description short (${item.description.length} chars)`);
  if (item.link && !/^https:\/\//.test(item.link)) errors.push(`link must be absolute https`);
  if (item.image_link && !/^https:\/\//.test(item.image_link)) errors.push(`image_link must be absolute https`);
  if (item.price && !/^\d+(\.\d{1,2})?\s+[A-Z]{3}$/.test(item.price)) errors.push(`price malformed: "${item.price}" (expected "12.34 GBP")`);
  if (item.availability && !['in stock', 'out of stock', 'preorder', 'backorder'].includes(item.availability)) {
    errors.push(`availability invalid: "${item.availability}"`);
  }
  if (item.condition && !['new', 'refurbished', 'used'].includes(item.condition)) {
    errors.push(`condition invalid: "${item.condition}"`);
  }
  if (!item.google_product_category) warnings.push('google_product_category missing (recommended)');
  if (item.identifier_exists !== 'no' && !item.identifier_exists) warnings.push('identifier_exists not set');
  return { errors, warnings };
}

export default function MerchantFeedTab() {
  const [xml, setXml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'table' | 'xml'>('table');
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings'>('all');

  const load = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(FEED_URL, { headers: { Accept: 'application/xml' }, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setXml(await res.text());
    } catch (e: any) {
      setFetchError(e?.message || 'Failed to fetch feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const parsed = useMemo(() => parseFeed(xml), [xml]);
  const validated = useMemo(
    () => parsed.items.map(it => ({ item: it, ...validateItem(it) })),
    [parsed.items]
  );

  const totals = useMemo(() => {
    const totalErrors = validated.reduce((n, v) => n + v.errors.length, 0);
    const totalWarnings = validated.reduce((n, v) => n + v.warnings.length, 0);
    const itemsWithErrors = validated.filter(v => v.errors.length > 0).length;
    return { totalErrors, totalWarnings, itemsWithErrors };
  }, [validated]);

  const visible = useMemo(() => {
    if (filter === 'errors') return validated.filter(v => v.errors.length > 0);
    if (filter === 'warnings') return validated.filter(v => v.warnings.length > 0);
    return validated;
  }, [validated, filter]);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(PUBLIC_FEED_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'google-merchant-feed.xml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Google Merchant Feed Preview</h1>
          <p className="text-sm text-slate-400">
            Live preview of <code className="text-emerald-400">{FEED_URL}</code> with required-field validation before submitting to Merchant Center.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 text-white text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={copyUrl} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 text-white text-sm">
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} Copy public URL
          </button>
          <a href={PUBLIC_FEED_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 text-white text-sm">
            <ExternalLink className="w-4 h-4" /> Open
          </a>
          <a href="/admin/merchant-feed-preview" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 text-white text-sm">
            <Eye className="w-4 h-4" /> Admin preview
          </a>
          <button onClick={download} disabled={!xml} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 border-2 border-emerald-500 text-white text-sm disabled:opacity-50">
            <Download className="w-4 h-4" /> Download XML
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Products" value={parsed.items.length} tone="info" />
        <SummaryCard label="Items with errors" value={totals.itemsWithErrors} tone={totals.itemsWithErrors ? 'error' : 'ok'} />
        <SummaryCard label="Total errors" value={totals.totalErrors} tone={totals.totalErrors ? 'error' : 'ok'} />
        <SummaryCard label="Total warnings" value={totals.totalWarnings} tone={totals.totalWarnings ? 'warn' : 'ok'} />
      </div>

      {fetchError && (
        <div className="p-4 rounded-lg bg-red-950/40 border-2 border-red-800 text-red-200 text-sm">
          Failed to load feed: {fetchError}
        </div>
      )}
      {parsed.error && (
        <div className="p-4 rounded-lg bg-red-950/40 border-2 border-red-800 text-red-200 text-sm font-mono">
          XML parse error: {parsed.error}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border-2 border-slate-700">
          <button onClick={() => setView('table')} className={`px-3 py-1.5 text-sm ${view === 'table' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Validation table</button>
          <button onClick={() => setView('xml')} className={`px-3 py-1.5 text-sm ${view === 'xml' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Raw XML</button>
        </div>
        {view === 'table' && (
          <div className="flex rounded-lg overflow-hidden border-2 border-slate-700">
            <button onClick={() => setFilter('all')} className={`px-3 py-1.5 text-sm ${filter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300'}`}>All ({validated.length})</button>
            <button onClick={() => setFilter('errors')} className={`px-3 py-1.5 text-sm ${filter === 'errors' ? 'bg-red-700 text-white' : 'bg-slate-800 text-slate-300'}`}>Errors ({totals.itemsWithErrors})</button>
            <button onClick={() => setFilter('warnings')} className={`px-3 py-1.5 text-sm ${filter === 'warnings' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>Warnings</button>
          </div>
        )}
      </div>

      {view === 'xml' ? (
        <pre className="p-4 rounded-lg bg-slate-900 border-2 border-slate-700 text-xs text-slate-300 overflow-auto max-h-[70vh] whitespace-pre-wrap">{xml || (loading ? 'Loading…' : 'No content')}</pre>
      ) : (
        <div className="space-y-3">
          {visible.length === 0 && !loading && (
            <div className="p-6 text-center text-slate-400 text-sm rounded-lg bg-slate-900 border-2 border-slate-800">
              {validated.length === 0 ? 'No items found in feed.' : 'No items match this filter.'}
            </div>
          )}
          {visible.map(({ item, errors, warnings }) => (
            <div key={item.id} className="rounded-xl bg-slate-900 border-2 border-slate-800 overflow-hidden">
              <div className="flex gap-4 p-4">
                {item.image_link && (
                  <img src={item.image_link} alt="" className="w-20 h-20 rounded-lg object-cover bg-slate-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {errors.length === 0 && warnings.length === 0 && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {errors.length > 0 && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    {errors.length === 0 && warnings.length > 0 && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                    <p className="text-white font-semibold text-sm truncate">{item.title || '(no title)'}</p>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mb-2">id: {item.id}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                    <Field label="price" value={item.price} />
                    <Field label="availability" value={item.availability} />
                    <Field label="brand" value={item.brand} />
                    <Field label="condition" value={item.condition} />
                    <Field label="product_type" value={item.product_type} span={2} />
                    <Field label="google_product_category" value={item.google_product_category} span={2} />
                  </div>
                  <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-400 hover:text-emerald-300">
                    {item.link} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              {(errors.length > 0 || warnings.length > 0) && (
                <div className="px-4 py-3 border-t-2 border-slate-800 bg-slate-950/50 space-y-1">
                  {errors.map((e, i) => (
                    <p key={`e${i}`} className="text-xs text-red-300 flex items-start gap-2">
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" /> {e}
                    </p>
                  ))}
                  {warnings.map((w, i) => (
                    <p key={`w${i}`} className="text-xs text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /> {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <span className="text-slate-500">{label}: </span>
      <span className={value ? 'text-slate-200' : 'text-red-400 italic'}>{value || 'missing'}</span>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'error' | 'info' }) {
  const colors = {
    ok: 'border-emerald-700 bg-emerald-950/30 text-emerald-300',
    warn: 'border-amber-700 bg-amber-950/30 text-amber-300',
    error: 'border-red-700 bg-red-950/30 text-red-300',
    info: 'border-slate-700 bg-slate-900 text-slate-200',
  }[tone];
  return (
    <div className={`p-4 rounded-xl border-2 ${colors}`}>
      <p className="text-xs uppercase tracking-wider opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

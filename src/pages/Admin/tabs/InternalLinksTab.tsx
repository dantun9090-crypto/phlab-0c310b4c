/**
 * Internal Links — auto-suggest contextual <a> links to hub PDPs
 * across product descriptions. Pure-client; uses `fetchAllProducts`
 * for the read path and `updateProduct` for the write path. Each row
 * is opt-in with a Preview → Apply flow; nothing changes silently.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link2, CheckCircle2, AlertCircle, Loader2, Eye } from 'lucide-react';
import { fetchAllProducts, type SeoProduct } from '@/lib/firestore-rest';
import { updateProduct } from '@/lib/firebase';
import {
  scanForLinkSuggestions,
  applyLinkSuggestions,
  HUB_TARGETS,
  type LinkSuggestion,
} from '@/lib/internal-link-booster';
import { logAdminAction } from '@/lib/admin-audit';

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  suggestions: LinkSuggestion[];
}

export default function InternalLinksTab() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({}); // productId → set of hubSlug
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<{ productId: string; html: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const products = await fetchAllProducts();
        const built: ProductRow[] = products.map((p: SeoProduct) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          description: p.description || '',
          suggestions: scanForLinkSuggestions(p.description || '', p.slug),
        }));
        // Auto-select every suggestion by default — admin opts OUT, not in.
        const sel: Record<string, Set<string>> = {};
        for (const r of built) sel[r.id] = new Set(r.suggestions.map((s) => s.hubSlug));
        setRows(built);
        setSelected(sel);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totals = useMemo(() => {
    const suggestions = rows.reduce((a, r) => a + r.suggestions.length, 0);
    const productsWith = rows.filter((r) => r.suggestions.length).length;
    return { suggestions, productsWith };
  }, [rows]);

  const toggle = (productId: string, hubSlug: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[productId] ?? []);
      if (set.has(hubSlug)) set.delete(hubSlug);
      else set.add(hubSlug);
      next[productId] = set;
      return next;
    });
  };

  const apply = async (row: ProductRow) => {
    const chosen = row.suggestions.filter((s) => selected[row.id]?.has(s.hubSlug));
    if (!chosen.length) return;
    setApplying(row.id);
    try {
      const next = applyLinkSuggestions(row.description, chosen);
      await updateProduct(row.id, { description: next } as any);
      try {
        await logAdminAction({
          action: 'product.update',
          target: `products/${row.id}`,
          meta: {
            kind: 'internal_links_applied',
            slug: row.slug,
            count: chosen.length,
            hubs: chosen.map((c) => c.hubSlug),
          },
        });
      } catch { /* audit best-effort */ }
      setApplied((p) => ({ ...p, [row.id]: chosen.length }));
      // Drop applied suggestions from row so it disappears from the queue.
      setRows((prev) => prev.map((r) =>
        r.id === row.id
          ? { ...r, description: next, suggestions: scanForLinkSuggestions(next, r.slug) }
          : r,
      ));
    } catch (e) {
      alert(`Failed to apply links: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Link2 className="w-6 h-6 text-emerald-400" /> Internal Link Booster
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Auto-detects mentions of hub compounds across product descriptions and proposes contextual
          <code className="px-1 mx-1 bg-slate-800 rounded">&lt;a&gt;</code> links to the matching PDP. Only the first
          occurrence per hub is linked, never inside existing links or headings, never self-links.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI label="Hub compounds" value={HUB_TARGETS.length} />
        <KPI label="Products with suggestions" value={totals.productsWith} />
        <KPI label="Total suggestions" value={totals.suggestions} />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin" /> Scanning product descriptions…
        </div>
      )}
      {err && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5" /> {err}
        </div>
      )}

      {!loading && !err && totals.suggestions === 0 && (
        <div className="p-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm">
          No new internal-link opportunities found. All hub compounds are either already linked, not mentioned,
          or only mentioned on their own PDP.
        </div>
      )}

      <div className="space-y-4">
        {rows.filter((r) => r.suggestions.length > 0).map((row) => {
          const sel = selected[row.id] ?? new Set();
          return (
            <article key={row.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <header className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-white font-semibold">{row.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">/products/{row.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  {applied[row.id] && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> {applied[row.id]} applied
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreview({
                      productId: row.id,
                      html: applyLinkSuggestions(
                        row.description,
                        row.suggestions.filter((s) => sel.has(s.hubSlug)),
                      ),
                    })}
                    className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 min-h-[36px]"
                    aria-label={`Preview rewritten description for ${row.name}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(row)}
                    disabled={applying === row.id || sel.size === 0}
                    className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center gap-1 min-h-[36px]"
                  >
                    {applying === row.id
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying…</>
                      : <>Apply {sel.size} link{sel.size === 1 ? '' : 's'}</>}
                  </button>
                </div>
              </header>

              <ul className="space-y-2">
                {row.suggestions.map((s) => (
                  <li key={s.hubSlug} className="flex items-start gap-3 p-2 rounded bg-slate-950/40 border border-slate-800">
                    <input
                      type="checkbox"
                      checked={sel.has(s.hubSlug)}
                      onChange={() => toggle(row.id, s.hubSlug)}
                      className="mt-1 w-4 h-4 accent-emerald-500"
                      aria-label={`Link "${s.match}" to ${s.hubLabel}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 text-xs font-mono">{s.match}</span>
                        <span className="text-slate-400 text-xs">→</span>
                        <a href={s.href} target="_blank" rel="noreferrer" className="text-emerald-400 text-xs hover:underline font-mono">{s.href}</a>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">…{s.snippet}…</p>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Description preview"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg max-w-3xl w-full max-h-[80vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-white font-semibold">Rewritten description</h4>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-white text-sm" type="button">Close</button>
            </div>
            <div
              className="prose prose-invert prose-sm max-w-none"
              // eslint-disable-next-line react/no-danger -- admin-only preview of admin-authored HTML
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-2xl font-semibold text-white mt-1">{value}</div>
    </div>
  );
}

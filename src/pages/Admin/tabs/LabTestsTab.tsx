/**
 * Admin → Lab Tests.
 *
 * Manages the `lab_tests` table (batch-level analytical results from the
 * independent labs). Reads go through an admin server fn (full table,
 * including rows hidden from customers); the public `/verify` page reads the
 * same table with the browser client and only sees `is_public = true` rows.
 *
 * Link policy: the copy/QR helpers build `/verify?...` URLs only — no existing
 * product URL, slug or feed link is generated or altered here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  Loader2,
  Search,
  Upload,
  Download,
  Plus,
  Copy,
  QrCode,
  Trash2,
  Pencil,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  X,
} from 'lucide-react';
import { getAdminIdToken } from '@/lib/auth-ready';
import { logAdminAction } from '@/lib/admin-audit';
import {
  listLabTestsAdmin,
  saveLabTestAdmin,
  setLabTestPublicAdmin,
  deleteLabTestAdmin,
  importLabTestsAdmin,
} from '@/lib/lab-tests.functions';
import {
  type LabTest,
  SHOP_LAB_PRODUCTS,
  SHOP_LAB_PRODUCT_LABELS,
  LAB_SOURCES,
  LAB_SOURCE_CLASS,
  PURITY_TIER_CLASS,
  purityTier,
  formatMass,
  formatPurity,
  formatTestDate,
  formatTestSummary,
  verifyBatchUrl,
  verifyProductUrl,
  toShopProductKey,
  parsePurity,
  parseMass,
  parseTestDate,
  inferLabSource,
  csvTemplate,
  CSV_TEMPLATE_HEADERS,
} from '@/lib/lab-tests';

type SortKey = 'product' | 'label_mg' | 'batch' | 'cap_color' | 'test_date' | 'avg_purity' | 'lab_source';

const INPUT = 'w-full border-2 border-slate-600 bg-slate-800 text-white min-h-[48px] rounded-lg px-3';
const BTN = 'inline-flex items-center gap-2 rounded-lg border-2 border-slate-600 bg-slate-800 px-3 min-h-[40px] text-sm text-white hover:bg-slate-700 disabled:opacity-50';

interface DraftRow {
  id?: string;
  product: string;
  label_mg: string;
  batch: string;
  cap_color: string;
  test_date: string;
  mass_1: string;
  purity_1: string;
  mass_2: string;
  purity_2: string;
  test_link: string;
  lab_source: string;
  is_public: boolean;
}

const EMPTY_DRAFT: DraftRow = {
  product: SHOP_LAB_PRODUCTS[0],
  label_mg: '',
  batch: '',
  cap_color: '',
  test_date: '',
  mass_1: '',
  purity_1: '',
  mass_2: '',
  purity_2: '',
  test_link: '',
  lab_source: 'Janoshik',
  is_public: false,
};

function toDraft(row: LabTest): DraftRow {
  return {
    id: row.id,
    product: row.product,
    label_mg: row.label_mg ?? '',
    batch: row.batch ?? '',
    cap_color: row.cap_color ?? '',
    test_date: row.test_date ?? '',
    mass_1: row.mass_1 == null ? '' : String(row.mass_1),
    purity_1: row.purity_1 == null ? '' : String(row.purity_1),
    mass_2: row.mass_2 == null ? '' : String(row.mass_2),
    purity_2: row.purity_2 == null ? '' : String(row.purity_2),
    test_link: row.test_link ?? '',
    lab_source: row.lab_source ?? '',
    is_public: row.is_public,
  };
}

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

export default function LabTestsTab() {
  const [rows, setRows] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('test_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [qrRow, setQrRow] = useState<LabTest | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await getAdminIdToken();
      const res = await listLabTestsAdmin({ data: { idToken } });
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load lab tests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live search with 300 ms debounce.
  const debounceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearch(searchInput.trim().toLowerCase());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(debounceRef.current);
  }, [searchInput]);

  const filtered = useMemo(() => {
    const q = search;
    const base = !q
      ? rows
      : rows.filter((r) =>
          [r.product, SHOP_LAB_PRODUCT_LABELS[r.product] ?? '', r.batch, r.cap_color, r.test_date, r.lab_source, r.label_mg]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        );
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, search, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'test_date' || key === 'avg_purity' ? 'desc' : 'asc');
    }
  };

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(msg);
    } catch {
      notify('Could not copy — clipboard blocked');
    }
  };

  const togglePublic = async (row: LabTest) => {
    const next = !row.is_public;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_public: next } : r)));
    try {
      const idToken = await getAdminIdToken();
      await setLabTestPublicAdmin({ data: { idToken, id: row.id, isPublic: next } });
      void logAdminAction({
        action: 'lab_test.publish.toggle',
        target: `lab_tests/${row.id}`,
        after: { is_public: next },
        meta: { batch: row.batch, product: row.product },
      });
      notify(next ? 'Visible to customers' : 'Hidden from customers');
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_public: row.is_public } : r)));
      notify(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.product.trim() || !draft.batch.trim() || !draft.test_date || !draft.purity_1 || !draft.test_link.trim()) {
      notify('Product, batch, test date, purity 1 and report link are required');
      return;
    }
    const purity1 = parsePurity(draft.purity_1);
    if (purity1 == null) {
      notify('Purity 1 must be between 0 and 100');
      return;
    }
    setSaving(true);
    try {
      const idToken = await getAdminIdToken();
      const res = await saveLabTestAdmin({
        data: {
          idToken,
          row: {
            ...(draft.id ? { id: draft.id } : {}),
            product: draft.product.trim(),
            label_mg: draft.label_mg.trim() || null,
            batch: draft.batch.trim() || null,
            cap_color: draft.cap_color.trim() || null,
            test_date: draft.test_date || null,
            mass_1: parseMass(draft.mass_1),
            purity_1: purity1,
            mass_2: parseMass(draft.mass_2),
            purity_2: parsePurity(draft.purity_2),
            test_link: draft.test_link.trim() || null,
            lab_source: draft.lab_source.trim() || inferLabSource(draft.test_link),
            is_public: draft.is_public,
          },
        },
      });
      setRows((prev) => {
        const exists = prev.some((r) => r.id === res.row.id);
        return exists ? prev.map((r) => (r.id === res.row.id ? res.row : r)) : [res.row, ...prev];
      });
      void logAdminAction({
        action: draft.id ? 'lab_test.update' : 'lab_test.create',
        target: `lab_tests/${res.row.id}`,
        after: res.row,
      });
      setDraft(null);
      notify('Saved');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: LabTest) => {
    if (!window.confirm(`Delete the test for batch ${row.batch ?? '(no batch)'}? This cannot be undone.`)) return;
    try {
      const idToken = await getAdminIdToken();
      await deleteLabTestAdmin({ data: { idToken, id: row.id } });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      void logAdminAction({ action: 'lab_test.delete', target: `lab_tests/${row.id}`, before: row });
      notify('Deleted');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lab-tests-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortIcon = (key: SortKey) =>
    key !== sortKey ? null : sortDir === 'asc' ? (
      <ArrowUp className="inline h-3 w-3" />
    ) : (
      <ArrowDown className="inline h-3 w-3" />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold text-white">Lab Tests</h2>
        <button type="button" className={BTN} onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </button>
        <button type="button" className={BTN} onClick={downloadTemplate}>
          <Download className="h-4 w-4" /> CSV template
        </button>
        <button type="button" className={BTN} onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import CSV
        </button>
        <button type="button" className={BTN} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Plus className="h-4 w-4" /> Add test
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${INPUT} pl-9`}
            placeholder="Search product, batch, cap colour or date…"
            aria-label="Search lab tests"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Rows
          <select
            className="rounded-lg border-2 border-slate-600 bg-slate-800 px-2 py-2 text-white"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Rows per page"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-slate-400">
          {filtered.length} test{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-sm text-red-200">{error}</div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-300">
            <tr>
              {([
                ['product', 'Product'],
                ['label_mg', 'Label'],
                ['batch', 'Batch'],
                ['cap_color', 'Cap colour'],
                ['test_date', 'Test date'],
              ] as Array<[SortKey, string]>).map(([key, label]) => (
                <th key={key} className="px-3 py-2 text-left">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(key)}>
                    {label} {sortIcon(key)}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-left">Sample 1</th>
              <th className="px-3 py-2 text-left">Sample 2</th>
              <th className="px-3 py-2 text-left">
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('avg_purity')}>
                  Average {sortIcon('avg_purity')}
                </button>
              </th>
              <th className="px-3 py-2 text-left">
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('lab_source')}>
                  Lab {sortIcon('lab_source')}
                </button>
              </th>
              <th className="px-3 py-2 text-left">Public</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
                </td>
              </tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                  No tests yet — import a CSV or add one manually.
                </td>
              </tr>
            )}
            {pageRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800 align-top">
                <td className="px-3 py-2 text-white">{SHOP_LAB_PRODUCT_LABELS[row.product] ?? row.product}</td>
                <td className="px-3 py-2 text-slate-300">{row.label_mg ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-slate-200">{row.batch ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300">{row.cap_color ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-300">{formatTestDate(row.test_date)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                  {formatMass(row.mass_1)} / {formatPurity(row.purity_1)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                  {row.mass_2 == null && row.purity_2 == null
                    ? '—'
                    : `${formatMass(row.mass_2)} / ${formatPurity(row.purity_2)}`}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${PURITY_TIER_CLASS[purityTier(row.avg_purity)]}`}
                  >
                    {formatPurity(row.avg_purity)}
                  </span>
                  <div className="mt-1 text-xs text-slate-400">{formatMass(row.avg_mass)}</div>
                </td>
                <td className="px-3 py-2">
                  {row.lab_source ? (
                    <span
                      className={`rounded-full border px-2 py-1 text-xs ${LAB_SOURCE_CLASS[row.lab_source] ?? 'border-slate-600 bg-slate-800 text-slate-300'}`}
                    >
                      {row.lab_source}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.is_public}
                    aria-label={`Toggle customer visibility for batch ${row.batch ?? 'unknown'}`}
                    onClick={() => void togglePublic(row)}
                    className={`h-6 w-11 rounded-full border-2 transition-colors ${row.is_public ? 'border-emerald-500 bg-emerald-600' : 'border-slate-600 bg-slate-700'}`}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-white transition-transform ${row.is_public ? 'translate-x-5' : 'translate-x-1'}`}
                    />
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {row.batch && (
                      <button
                        type="button"
                        className={BTN}
                        aria-label={`Copy verification link for batch ${row.batch}`}
                        title="Copy batch link"
                        onClick={() => void copy(verifyBatchUrl(row.batch!), 'Batch link copied')}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={BTN}
                      aria-label={`Copy product verification link for ${row.product}`}
                      title="Copy product link"
                      onClick={() => void copy(verifyProductUrl(row.product), 'Product link copied')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      aria-label={`Copy summary text for batch ${row.batch ?? 'unknown'}`}
                      title="Copy summary for email"
                      onClick={() => void copy(formatTestSummary(row), 'Summary copied')}
                    >
                      <Copy className="h-4 w-4 text-emerald-400" />
                    </button>
                    {row.batch && (
                      <button
                        type="button"
                        className={BTN}
                        aria-label={`Show QR code for batch ${row.batch}`}
                        title="QR code"
                        onClick={() => setQrRow(row)}
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={BTN}
                      aria-label="Edit test"
                      title="Edit"
                      onClick={() => setDraft(toDraft(row))}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      aria-label="Delete test"
                      title="Delete"
                      onClick={() => void remove(row)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-300">
        <button type="button" className={BTN} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pageCount}
        </span>
        <button type="button" className={BTN} disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-emerald-600 bg-slate-900 px-4 py-2 text-sm text-emerald-200 shadow-lg"
        >
          {toast}
        </div>
      )}

      {draft && (
        <EditModal
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void saveDraft()}
        />
      )}

      {qrRow && <QrModal row={qrRow} onClose={() => setQrRow(null)} />}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={(msg) => {
            setImportOpen(false);
            notify(msg);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Edit / add modal ─────────────────────────── */

function EditModal({
  draft,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: DraftRow;
  saving: boolean;
  onChange: (d: DraftRow) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof DraftRow>(key: K, value: DraftRow[K]) => onChange({ ...draft, [key]: value });
  const avgPurity = (() => {
    const p1 = parsePurity(draft.purity_1);
    const p2 = parsePurity(draft.purity_2);
    if (p1 != null && p2 != null) return (p1 + p2) / 2;
    return p1 ?? p2;
  })();
  const avgMass = (() => {
    const m1 = parseMass(draft.mass_1);
    const m2 = parseMass(draft.mass_2);
    if (m1 != null && m2 != null) return (m1 + m2) / 2;
    return m1 ?? m2;
  })();

  return (
    <Modal title={draft.id ? 'Edit lab test' : 'Add lab test'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Product *
          <select className={INPUT} value={draft.product} onChange={(e) => set('product', e.target.value)}>
            {SHOP_LAB_PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {SHOP_LAB_PRODUCT_LABELS[p] ?? p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Label (mg)
          <input className={INPUT} value={draft.label_mg} onChange={(e) => set('label_mg', e.target.value)} />
        </label>
        <label className="text-sm text-slate-300">
          Batch *
          <input className={INPUT} value={draft.batch} onChange={(e) => set('batch', e.target.value)} />
        </label>
        <label className="text-sm text-slate-300">
          Cap colour
          <input className={INPUT} value={draft.cap_color} onChange={(e) => set('cap_color', e.target.value)} />
        </label>
        <label className="text-sm text-slate-300">
          Test date *
          <input type="date" className={INPUT} value={draft.test_date} onChange={(e) => set('test_date', e.target.value)} />
        </label>
        <label className="text-sm text-slate-300">
          Lab source
          <select className={INPUT} value={draft.lab_source} onChange={(e) => set('lab_source', e.target.value)}>
            <option value="">—</option>
            {LAB_SOURCES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Sample 1 mass (mg)
          <input className={INPUT} value={draft.mass_1} onChange={(e) => set('mass_1', e.target.value)} />
        </label>
        <label className="text-sm text-slate-300">
          Sample 1 purity (%) *
          <input className={INPUT} value={draft.purity_1} onChange={(e) => set('purity_1', e.target.value)} />
        </label>
        <label className="text-sm text-slate-300">
          Sample 2 mass (mg)
          <input className={INPUT} value={draft.mass_2} onChange={(e) => set('mass_2', e.target.value)} />
        </label>
        <label className="text-sm text-slate-300">
          Sample 2 purity (%)
          <input className={INPUT} value={draft.purity_2} onChange={(e) => set('purity_2', e.target.value)} />
        </label>
        <label className="text-sm text-slate-300 sm:col-span-2">
          Lab report link *
          <input className={INPUT} value={draft.test_link} onChange={(e) => set('test_link', e.target.value)} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
        <span>
          Average purity: <strong className="text-white">{avgPurity == null ? '—' : `${avgPurity.toFixed(2)}%`}</strong>
        </span>
        <span>
          Average mass: <strong className="text-white">{avgMass == null ? '—' : `${avgMass.toFixed(2)} mg`}</strong>
        </span>
        <label className="ml-auto flex items-center gap-2">
          <input type="checkbox" checked={draft.is_public} onChange={(e) => set('is_public', e.target.checked)} />
          Visible to customers
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={BTN} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────── QR modal ─────────────────────────────── */

function QrModal({ row, onClose }: { row: LabTest; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = row.batch ? verifyBatchUrl(row.batch) : '';

  useEffect(() => {
    let alive = true;
    void import('qrcode').then(async (QR) => {
      const png = await QR.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: 'M' });
      if (alive) setDataUrl(png);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <Modal title={`QR code — batch ${row.batch ?? ''}`} onClose={onClose}>
      <div className="flex flex-col items-center gap-3">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR code linking to the verification page for batch ${row.batch}`} className="h-64 w-64 rounded-lg bg-white p-2" />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        )}
        <code className="break-all text-center text-xs text-slate-400">{url}</code>
        {dataUrl && (
          <a className={BTN} href={dataUrl} download={`verify-${row.batch}.png`}>
            <Download className="h-4 w-4" /> Download PNG
          </a>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────────── Import modal ───────────────────────────── */

type MappingKey = (typeof CSV_TEMPLATE_HEADERS)[number];

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<MappingKey, number>>(
    () => Object.fromEntries(CSV_TEMPLATE_HEADERS.map((k) => [k, -1])) as Record<MappingKey, number>,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setProblem('That file has no data rows.');
      return;
    }
    const head = parsed[0]!.map((h) => h.trim());
    setHeaders(head);
    setDataRows(parsed.slice(1));
    const auto = Object.fromEntries(
      CSV_TEMPLATE_HEADERS.map((key) => [
        key,
        head.findIndex((h) => h.toLowerCase().replace(/[\s_]/g, '') === key.toLowerCase().replace(/[\s_]/g, '')),
      ]),
    ) as Record<MappingKey, number>;
    setMapping(auto);
    setProblem(null);
  };

  const runImport = async () => {
    if (mapping.product < 0 || mapping.test_link < 0) {
      setProblem('At least the product and lab report link columns must be mapped.');
      return;
    }
    setBusy(true);
    setProblem(null);
    const rejects: string[] = [];
    const payload: Array<Record<string, unknown>> = [];

    dataRows.forEach((cells, i) => {
      const get = (k: MappingKey) => (mapping[k] >= 0 ? (cells[mapping[k]] ?? '').trim() : '');
      const rawProduct = get('product');
      const productKey = toShopProductKey(rawProduct);
      if (!productKey) {
        rejects.push(`Row ${i + 2}: "${rawProduct || 'empty'}" is not a shop product — skipped`);
        return;
      }
      const link = get('test_link');
      if (!/^https?:\/\//i.test(link)) {
        rejects.push(`Row ${i + 2}: missing or invalid lab report link — skipped`);
        return;
      }
      const purity1 = parsePurity(get('purity_1'));
      const purity2 = parsePurity(get('purity_2'));
      if (get('purity_1') && purity1 == null) {
        rejects.push(`Row ${i + 2}: purity "${get('purity_1')}" is out of range — skipped`);
        return;
      }
      payload.push({
        product: productKey,
        label_mg: get('label_mg') || null,
        batch: get('batch') || null,
        cap_color: get('cap_color') || null,
        test_date: parseTestDate(get('test_date')),
        mass_1: parseMass(get('mass_1')),
        purity_1: purity1,
        mass_2: parseMass(get('mass_2')),
        purity_2: purity2,
        test_link: link,
        lab_source: get('lab_source') || inferLabSource(link),
        is_public: false,
      });
    });

    setRejected(rejects);

    if (payload.length === 0) {
      setProblem('Nothing to import — every row was rejected.');
      setBusy(false);
      return;
    }

    try {
      const idToken = await getAdminIdToken();
      let inserted = 0;
      let skipped = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const res = await importLabTestsAdmin({
          data: { idToken, rows: chunk as never },
        });
        inserted += res.inserted;
        skipped += res.skipped;
      }
      void logAdminAction({
        action: 'lab_test.import',
        target: 'lab_tests',
        meta: { inserted, skipped, rejected: rejects.length },
      });
      onDone(`${inserted} added, ${skipped} duplicates skipped, ${rejects.length} rejected`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import lab tests from CSV" onClose={onClose}>
      <input
        type="file"
        accept=".csv,text/csv"
        className={INPUT}
        aria-label="Choose a CSV file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />

      {headers.length > 0 && (
        <>
          <p className="mt-3 text-sm text-slate-300">
            {dataRows.length} row{dataRows.length === 1 ? '' : 's'} found. Match your file's columns to the fields
            below. Imported rows stay hidden from customers until you switch them on.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CSV_TEMPLATE_HEADERS.map((key) => (
              <label key={key} className="text-sm text-slate-300">
                {key}
                <select
                  className={INPUT}
                  value={mapping[key]}
                  onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value) })}
                >
                  <option value={-1}>— not in file —</option>
                  {headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={i}>
                      {h || `(column ${i + 1})`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      )}

      {problem && <p className="mt-3 text-sm text-red-300">{problem}</p>}

      {rejected.length > 0 && (
        <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-400">
          {rejected.map((r) => (
            <div key={r}>{r}</div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={BTN} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          onClick={() => void runImport()}
          disabled={busy || dataRows.length === 0}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Import
        </button>
      </div>
    </Modal>
  );
}

/* ───────────────────────────── Shared modal ───────────────────────────── */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button type="button" className={BTN} onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

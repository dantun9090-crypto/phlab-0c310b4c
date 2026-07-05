/**
 * Admin → Newsletter management.
 * Subscribers list + popup settings. Uses existing `emailSubscribers`
 * collection and `newsletter_config/popup` doc.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  Users,
  Search,
  Trash2,
  Download,
  Settings,
  Loader2,
  Save,
  Inbox,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bug,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getNewsletterSubscribers,
  updateSubscriberStatus,
  deleteSubscriber,
  type Subscriber,
  type SubscriberStatus,
} from '@/lib/newsletter';
import {
  getPopupConfig,
  updatePopupConfig,
  DEFAULT_POPUP_CONFIG,
  type PopupConfig,
} from '@/lib/newsletter-config';
import ImageUploader from '@/components/admin/ImageUploader';
import { logAdminAction } from '@/lib/admin-audit';
import {
  clearNewsletterCooldown,
  setNewsletterDebug,
  isNewsletterDebugEnabled,
} from '@/components/NewsletterPopup';

type SubTab = 'subscribers' | 'settings';

const PAGE_SIZE = 10;

function fmtDate(d: Date | null | undefined) {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status?: SubscriberStatus }) {
  const s = status ?? 'active';
  const map: Record<SubscriberStatus, string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    unsubscribed: 'bg-red-500/15 text-red-400 border-red-500/30',
    bounced: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[s]}`}
    >
      {s}
    </span>
  );
}

export default function NewsletterTab() {
  const [tab, setTab] = useState<SubTab>('subscribers');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Mail className="w-6 h-6 text-emerald-500" />
          Newsletter
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage subscribers and the on-site newsletter popup.
        </p>
      </header>

      <div className="flex gap-1 mb-6 border-b border-slate-700">
        {(
          [
            { id: 'subscribers', label: 'Subscribers', icon: Users },
            { id: 'settings', label: 'Popup Settings', icon: Settings },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'subscribers' ? <SubscribersPanel /> : <SettingsPanel />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Subscribers panel
// ─────────────────────────────────────────────────────────────────────
function SubscribersPanel() {
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriberStatus>('all');
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getNewsletterSubscribers();
      setRows(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load subscribers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && (r.status ?? 'active') !== statusFilter) return false;
      if (needle && !r.email.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  // Prune selections that are no longer visible (filter/search changed).
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((r) => r.id));
      const next = new Set<string>();
      prev.forEach((id) => visible.has(id) && next.add(id));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let total = 0;
    let activeThisMonth = 0;
    let unsub = 0;
    for (const r of rows) {
      total += 1;
      if ((r.status ?? 'active') === 'unsubscribed') unsub += 1;
      if ((r.status ?? 'active') === 'active' && r.subscribedAt && r.subscribedAt >= monthStart) {
        activeThisMonth += 1;
      }
    }
    return { total, activeThisMonth, unsub };
  }, [rows]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageAllSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const togglePageAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map((r) => r.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const changeStatus = async (id: string, status: SubscriberStatus) => {
    try {
      await updateSubscriberStatus(id, status);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      toast.success(`Marked as ${status}.`);
      void logAdminAction({
        action: 'marketing.subscriber.update',
        target: id,
        meta: { status },
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSubscriber(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('Subscriber deleted.');
      void logAdminAction({
        action: 'marketing.subscriber.delete',
        target: id,
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete subscriber.');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const bulkUpdateStatus = async (status: SubscriberStatus) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(
      ids.map((id) => updateSubscriberStatus(id, status)),
    );
    const ok: string[] = [];
    let failed = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push(ids[i]);
      else failed += 1;
    });
    if (ok.length > 0) {
      setRows((prev) =>
        prev.map((r) => (ok.includes(r.id) ? { ...r, status } : r)),
      );
      toast.success(`Updated ${ok.length} subscriber${ok.length === 1 ? '' : 's'} to ${status}.`);
      void logAdminAction({
        action: 'marketing.subscriber.bulk_update',
        target: `${ok.length} subscribers`,
        meta: { status, count: ok.length, failed },
      }).catch(() => {});
    }
    if (failed > 0) toast.error(`Failed to update ${failed} subscriber${failed === 1 ? '' : 's'}.`);
    clearSelection();
    setBulkBusy(false);
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => deleteSubscriber(id)));
    const ok: string[] = [];
    let failed = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push(ids[i]);
      else failed += 1;
    });
    if (ok.length > 0) {
      const okSet = new Set(ok);
      setRows((prev) => prev.filter((r) => !okSet.has(r.id)));
      toast.success(`Deleted ${ok.length} subscriber${ok.length === 1 ? '' : 's'}.`);
      void logAdminAction({
        action: 'marketing.subscriber.bulk_delete',
        target: `${ok.length} subscribers`,
        meta: { count: ok.length, failed },
      }).catch(() => {});
    }
    if (failed > 0) toast.error(`Failed to delete ${failed} subscriber${failed === 1 ? '' : 's'}.`);
    clearSelection();
    setBulkBusy(false);
    setConfirmBulkDelete(false);
  };

  const exportCsv = () => {
    const header = [
      'id',
      'email',
      'status',
      'source',
      'subscribedAt',
      'userAgent',
      'ipHash',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header.join(',')]
      .concat(
        filtered.map((r) =>
          [
            r.id,
            r.email,
            r.status ?? 'active',
            r.source ?? '',
            r.subscribedAt ? r.subscribedAt.toISOString() : '',
            r.userAgent ?? '',
            r.ipHash ?? '',
          ]
            .map(esc)
            .join(','),
        ),
      )
      .join('\n');
    // Prepend BOM so Excel detects UTF-8 correctly.
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `phlabs_newsletter_subscribers_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total subscribers" value={stats.total} icon={Users} tone="emerald" />
        <StatCard
          label="Active this month"
          value={stats.activeThisMonth}
          icon={CheckCircle2}
          tone="sky"
        />
        <StatCard label="Unsubscribed" value={stats.unsub} icon={XCircle} tone="red" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2 max-w-xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email…"
              className="w-full pl-9 min-h-[42px] rounded-lg bg-slate-800 border-2 border-slate-600 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | SubscriberStatus)}
            className="min-h-[42px] px-3 rounded-lg bg-slate-800 border-2 border-slate-600 text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
          <div className="text-sm text-emerald-100 font-medium flex-1">
            {selected.size} selected
            {selected.size < filtered.length && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="underline hover:text-white"
                >
                  Select all {filtered.length} matching
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              disabled={bulkBusy}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value as SubscriberStatus | '';
                if (v) void bulkUpdateStatus(v);
                e.target.value = '';
              }}
              className="min-h-[36px] px-3 rounded-md bg-slate-800 border border-slate-600 text-white text-sm focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              aria-label="Bulk status change"
            >
              <option value="" disabled>
                Set status…
              </option>
              <option value="active">Mark as Active</option>
              <option value="unsubscribed">Mark as Unsubscribed</option>
              <option value="bounced">Mark as Bounced</option>
            </select>
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-2 px-3 min-h-[36px] rounded-md bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {bulkBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={bulkBusy}
              className="px-3 min-h-[36px] rounded-md bg-slate-700 hover:bg-slate-600 text-white text-sm disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-500">
            <Inbox className="w-10 h-10 mb-2" />
            <p className="text-sm">No subscribers yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-slate-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={pageAllSelected}
                      onChange={togglePageAll}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Subscribed</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pageRows.map((r) => {
                  const isSel = selected.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-800/40 ${isSel ? 'bg-emerald-500/5' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleOne(r.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                          aria-label={`Select ${r.email}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-white">{r.email}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-400">{r.source ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(r.subscribedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <select
                            value={r.status ?? 'active'}
                            onChange={(e) =>
                              changeStatus(r.id, e.target.value as SubscriberStatus)
                            }
                            className="min-h-[36px] px-2 rounded-md bg-slate-800 border border-slate-600 text-white text-xs focus:border-emerald-500 focus:outline-none"
                            aria-label={`Change status for ${r.email}`}
                          >
                            <option value="active">Active</option>
                            <option value="unsubscribed">Unsubscribed</option>
                            <option value="bounced">Bounced</option>
                          </select>
                          <button
                            onClick={() => setConfirmDeleteId(r.id)}
                            className="p-2 rounded-md text-red-400 hover:bg-red-500/10"
                            aria-label={`Delete ${r.email}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {page} of {totalPages} · {filtered.length} results
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete subscriber?</h3>
                <p className="text-sm text-slate-400 mt-1">
                  This permanently removes them from the list. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !bulkBusy && setConfirmBulkDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Delete {selected.size} subscriber{selected.size === 1 ? '' : 's'}?
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  This permanently removes the selected subscribers. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkBusy}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void bulkDelete()}
                disabled={bulkBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {bulkBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete {selected.size}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'emerald' | 'sky' | 'red';
}) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    sky: 'text-sky-400 bg-sky-500/10',
    red: 'text-red-400 bg-red-500/10',
  };
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Settings panel
// ─────────────────────────────────────────────────────────────────────
function SettingsPanel() {
  const [config, setConfig] = useState<PopupConfig>(DEFAULT_POPUP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const cfg = await getPopupConfig();
      setConfig(cfg);
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof PopupConfig>(k: K, v: PopupConfig[K]) =>
    setConfig((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await updatePopupConfig(config);
      toast.success('Popup settings saved.');
      void logAdminAction({
        action: 'marketing.popup.update',
        target: 'newsletter_config/popup',
        meta: {
          isEnabled: config.isEnabled,
          delaySeconds: config.delaySeconds,
          cooldownDays: config.cooldownDays,
        },
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      toast.error('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const persistImage = async (imageUrl: string | null) => {
    setConfig((prev) => ({ ...prev, imageUrl }));
    try {
      await updatePopupConfig({ imageUrl });
      toast.success(imageUrl ? 'Image saved.' : 'Image removed.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save image.');
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-4">
          <h3 className="text-lg font-semibold text-white">Content</h3>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Headline</span>
            <input
              value={config.headline}
              onChange={(e) => set('headline', e.target.value)}
              className="mt-1 w-full min-h-[48px] px-3 rounded-lg bg-slate-800 border-2 border-slate-600 text-white focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Subheadline</span>
            <textarea
              value={config.subheadline}
              onChange={(e) => set('subheadline', e.target.value)}
              rows={3}
              className="mt-1 w-full min-h-[48px] px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-600 text-white focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Button text</span>
            <input
              value={config.buttonText}
              onChange={(e) => set('buttonText', e.target.value)}
              className="mt-1 w-full min-h-[48px] px-3 rounded-lg bg-slate-800 border-2 border-slate-600 text-white focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-4">
          <h3 className="text-lg font-semibold text-white">Behaviour</h3>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Delay (seconds)</span>
              <input
                type="number"
                min={0}
                max={60}
                value={config.delaySeconds}
                onChange={(e) => set('delaySeconds', Number(e.target.value))}
                className="mt-1 w-full min-h-[48px] px-3 rounded-lg bg-slate-800 border-2 border-slate-600 text-white focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Cooldown (days)</span>
              <input
                type="number"
                min={1}
                max={365}
                value={config.cooldownDays}
                onChange={(e) => set('cooldownDays', Number(e.target.value))}
                className="mt-1 w-full min-h-[48px] px-3 rounded-lg bg-slate-800 border-2 border-slate-600 text-white focus:border-emerald-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 border-2 border-slate-600 px-3 py-3 cursor-pointer">
            <span>
              <span className="block text-sm font-medium text-white">Popup enabled</span>
              <span className="block text-xs text-slate-400">
                Turn off to hide the popup site-wide.
              </span>
            </span>
            <button
              type="button"
              onClick={() => set('isEnabled', !config.isEnabled)}
              role="switch"
              aria-checked={config.isEnabled}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                config.isEnabled ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  config.isEnabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </label>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-4">
          <h3 className="text-lg font-semibold text-white">Image (optional)</h3>
          <ImageUploader
            pathPrefix="newsletter/popup-image"
            currentUrl={config.imageUrl}
            onUploaded={(url) => persistImage(url)}
            onRemoved={() => persistImage(null)}
          />
        </div>

        <DebugPanel />

        <button
          onClick={save}
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-70"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save settings
        </button>
      </div>

      {/* Preview */}
      <div className="lg:sticky lg:top-4 h-fit">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Live preview
        </h3>
        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-6 flex items-center justify-center">
          <div className="w-full max-w-[420px] bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden flex flex-col md:flex-row">
            {config.imageUrl && (
              <div className="md:w-[140px] w-full flex-shrink-0 bg-slate-950">
                <img
                  src={config.imageUrl}
                  alt=""
                  className="w-full h-32 md:h-full object-cover"
                />
              </div>
            )}
            <div className={`flex-1 p-5 ${!config.imageUrl ? 'text-center' : ''}`}>
              <div
                className={`flex items-center gap-2 mb-2 ${
                  !config.imageUrl ? 'justify-center' : ''
                }`}
              >
                <Mail className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">
                  Newsletter
                </span>
              </div>
              <h4 className="text-lg font-bold text-white">{config.headline}</h4>
              <p className="text-xs text-slate-400 mt-1">{config.subheadline}</p>
              <div className="mt-3 space-y-2">
                <div className="w-full min-h-[36px] rounded-md bg-slate-800 border border-slate-600 flex items-center px-3 text-xs text-slate-500">
                  Enter your email address
                </div>
                <div className="w-full min-h-[36px] rounded-md bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center">
                  {config.buttonText}
                </div>
                <p className="text-[10px] text-slate-500 text-center">
                  No spam. Unsubscribe anytime.
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Enabled: {config.isEnabled ? 'yes' : 'no'} · Delay {config.delaySeconds}s · Cooldown{' '}
          {config.cooldownDays}d
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Debug panel — testing helpers for the on-site popup
// ─────────────────────────────────────────────────────────────────────
function DebugPanel() {
  const [persistOn, setPersistOn] = useState(false);

  useEffect(() => {
    setPersistOn(isNewsletterDebugEnabled());
  }, []);

  const previewUrl = () => {
    if (typeof window === 'undefined') return '/?newsletter=preview';
    return `${window.location.origin}/?newsletter=preview`;
  };

  const openPreview = () => {
    window.open(previewUrl(), '_blank', 'noopener');
  };

  const clearCooldown = () => {
    clearNewsletterCooldown();
    toast.success('Popup cooldown cleared. Reload the homepage to see it again.');
  };

  const togglePersist = () => {
    const next = !persistOn;
    setNewsletterDebug(next);
    setPersistOn(next);
    toast.success(
      next
        ? 'Persistent debug ON — popup will force-show on every homepage load in this browser.'
        : 'Persistent debug OFF.',
    );
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Bug className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-amber-200 uppercase tracking-wider">
          Debug / Testing
        </h3>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        Bypass the 7-day cooldown and force-show the popup on the homepage. Only affects{' '}
        <strong>this browser</strong> — real visitors are unaffected.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openPreview}
          className="inline-flex items-center gap-2 px-3 min-h-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-sm font-medium"
        >
          <Eye className="w-4 h-4" />
          Force-show popup (new tab)
        </button>
        <button
          type="button"
          onClick={clearCooldown}
          className="inline-flex items-center gap-2 px-3 min-h-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-sm font-medium"
        >
          <RotateCcw className="w-4 h-4" />
          Clear cooldown
        </button>
        <button
          type="button"
          onClick={togglePersist}
          className={`inline-flex items-center gap-2 px-3 min-h-[40px] rounded-lg border-2 text-sm font-medium ${
            persistOn
              ? 'bg-amber-500/20 border-amber-500 text-amber-100'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-white'
          }`}
          aria-pressed={persistOn}
        >
          <Bug className="w-4 h-4" />
          Persistent debug: {persistOn ? 'ON' : 'OFF'}
        </button>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        URL flags: <code className="text-slate-400">?newsletter=preview</code> force-shows once,{' '}
        <code className="text-slate-400">?newsletter=reset</code> clears the cooldown,{' '}
        <code className="text-slate-400">?newsletter=debug</code> enables persistent mode.
      </p>
    </div>
  );
}


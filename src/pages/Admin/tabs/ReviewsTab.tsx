/**
 * Admin → Reviews
 *
 * Moderation queue for customer reviews. Approve publishes to the site
 * (homepage testimonials + product page), reject hides it, delete removes
 * the document. Every action is written to `auditLogs`.
 */
import { useEffect, useState } from 'react';
import {
  Star, Loader2, Check, X, Trash2, RefreshCw, ShieldAlert, MessageSquare,
} from 'lucide-react';
import {
  listAllReviews,
  setReviewStatus,
  deleteReview,
  validateReview,
  type Review,
  type ReviewStatus,
} from '@/lib/reviews';
import { auth } from '@/lib/firebase';
import { logAdminAction } from '@/lib/admin-audit';

const FILTERS: { id: 'pending' | 'approved' | 'rejected' | 'all'; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

export default function ReviewsTab() {
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setRows(await listAllReviews());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reviews');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function act(review: Review, status: ReviewStatus) {
    setBusyId(review.id);
    setError('');
    try {
      const uid = auth.currentUser?.uid || 'admin';
      await setReviewStatus(review.id, status, uid);
      void logAdminAction({
        action: status === 'approved' ? 'review.approve' : 'review.reject',
        target: `reviews/${review.id}`,
        before: { status: review.status },
        after: { status },
        meta: { name: review.name },
      });
      setRows((prev) => prev.map((r) => (r.id === review.id ? { ...r, status } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(review: Review) {
    if (!window.confirm(`Permanently delete the review from ${review.name}?`)) return;
    setBusyId(review.id);
    try {
      await deleteReview(review.id);
      void logAdminAction({
        action: 'review.delete',
        target: `reviews/${review.id}`,
        before: { name: review.name, rating: review.rating, status: review.status },
      });
      setRows((prev) => prev.filter((r) => r.id !== review.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-bold text-white">Customer Reviews</h1>
          <span className="text-xs text-slate-400">
            {counts.pending} pending · {counts.approved} live
          </span>
        </div>
        <button
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-600 bg-slate-800 px-3 text-xs font-medium text-white min-h-[48px] hover:border-emerald-500/50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition min-h-[40px] ${
              filter === f.id
                ? 'bg-emerald-500 text-white'
                : 'border-2 border-slate-600 bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading reviews…
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-8 text-sm text-slate-400">No reviews in this view.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {visible.map((r) => {
            const compliance = validateReview({
              name: r.name, rating: r.rating, title: r.title, body: r.body,
            });
            return (
              <li
                key={r.id}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`w-3.5 h-3.5 ${n <= r.rating ? 'text-amber-400 fill-current' : 'text-slate-700'}`}
                          />
                        ))}
                      </span>
                      <span className="text-sm font-semibold text-white">{r.name}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          r.status === 'approved'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : r.status === 'rejected'
                              ? 'bg-rose-500/15 text-rose-300'
                              : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {r.productName || 'Site review'}
                      {r.email ? ` · ${r.email}` : ''}
                      {r.createdAt?.toDate ? ` · ${r.createdAt.toDate().toLocaleString('en-GB')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void act(r, 'approved')}
                      disabled={busyId === r.id || r.status === 'approved' || !compliance.ok}
                      title={compliance.ok ? 'Approve' : compliance.message}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-200 min-h-[40px] disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => void act(r, 'rejected')}
                      disabled={busyId === r.id || r.status === 'rejected'}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 text-xs font-medium text-slate-200 min-h-[40px] disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => void remove(r)}
                      disabled={busyId === r.id}
                      aria-label="Delete review"
                      className="inline-flex items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-rose-300 min-h-[40px] disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {r.title && <p className="mt-3 text-sm font-semibold text-white">{r.title}</p>}
                <p className="mt-1 text-sm text-slate-300 whitespace-pre-wrap">{r.body}</p>

                {!compliance.ok && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {compliance.message} — cannot be approved.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

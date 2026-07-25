/**
 * Customer review submit form.
 *
 * Optional, never blocks the page. Submissions are created as `pending`
 * and only appear publicly after an admin approves them in Admin → Reviews.
 */
import { useState } from 'react';
import { Star, Loader2, CheckCircle2, MessageSquarePlus } from 'lucide-react';
import { submitReview } from '@/lib/reviews';
import { auth } from '@/lib/firebase';

interface Props {
  productId?: string | null;
  productName?: string | null;
  className?: string;
}

export default function ReviewForm({ productId = null, productName = null, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await submitReview({
        name,
        email: email || auth.currentUser?.email || null,
        rating,
        title,
        body,
        productId,
        productName,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your review.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={`rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center ${className}`}>
        <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
        <p className="mt-2 text-sm font-semibold text-white">Thank you for your review</p>
        <p className="mt-1 text-xs text-slate-400">
          It will appear on the site once our team has checked it.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        onTouchStart={() => setOpen(true)}
        className={`w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-slate-700 bg-slate-800/60 px-4 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:text-white ${className}`}
      >
        <MessageSquarePlus className="w-4 h-4 text-emerald-400" />
        Write a review
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`rounded-2xl border border-slate-800 bg-slate-900/70 p-5 ${className}`}
      aria-label="Write a review"
    >
      <h3 className="text-sm font-semibold text-white">Write a review</h3>
      <p className="mt-1 text-[11px] text-slate-500">
        Please describe your experience with our service and product quality only. Reviews containing
        medical or health claims cannot be published.
      </p>

      <div className="mt-4 flex items-center gap-1.5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)}
            className="p-1.5 rounded-md transition hover:bg-slate-800 min-h-[40px] min-w-[40px]"
          >
            <Star
              className={`w-5 h-5 ${n <= rating ? 'text-amber-400 fill-current' : 'text-slate-600'}`}
            />
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          placeholder="Your name"
          required
          className="w-full rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none min-h-[48px]"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value.slice(0, 200))}
          placeholder="Email (optional, not published)"
          className="w-full rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none min-h-[48px]"
        />
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 90))}
        placeholder="Headline (optional)"
        className="mt-3 w-full rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none min-h-[48px]"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 1000))}
        placeholder="How was your experience with ordering, packaging, delivery and documentation?"
        required
        rows={4}
        className="mt-3 w-full rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none min-h-[96px]"
      />
      <p className="mt-1 text-right text-[10px] text-slate-500">{body.length}/1000</p>

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 min-h-[48px]"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? 'Submitting…' : 'Submit review'}
        </button>
      </div>
    </form>
  );
}

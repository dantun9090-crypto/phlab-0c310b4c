/**
 * 18+ date-of-birth gate for accounts created without one.
 *
 * Google sign-up never asks for a date of birth, so those accounts used to
 * skip the 18+ gate entirely. This blocking modal collects and stores the
 * DoB the first time such a customer reaches their account, and signs out
 * anyone under 18.
 *
 * Client-only: the value is written to the customer's own document; order
 * placement keeps its independent server-side 18+ confirmation.
 */
import { useEffect, useState } from 'react';
import { Calendar, Loader2, ShieldAlert } from 'lucide-react';
import { auth, db, doc, getDoc, updateDoc, onAuthStateChanged, Timestamp, logoutUser } from '@/lib/firebase';

/** Whole years between `iso` and today. */
function ageFromIso(iso: string): number | null {
  const dob = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  if (dob > now || dob.getFullYear() < 1900) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export default function DobGateModal() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u || u.isAnonymous) { setOpen(false); return; }
      try {
        const snap = await getDoc(doc(db, 'customers', u.uid));
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        setOpen(!data['dateOfBirth']);
      } catch {
        setOpen(false);
      }
    });
    return unsub;
  }, []);

  if (!open) return null;

  const submit = async () => {
    setError('');
    const age = ageFromIso(value);
    if (age === null) { setError('Please enter a valid date of birth.'); return; }
    if (age < 18) {
      setError('You must be 18 or older to hold a PH Labs research account.');
      setSaving(true);
      try { await logoutUser(); } catch { /* ignore */ }
      window.location.href = '/';
      return;
    }
    const user = auth.currentUser;
    if (!user) { setError('Please sign in again.'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'customers', user.uid), {
        dateOfBirth: value,
        ageVerifiedAt: Timestamp.now(),
      });
      setOpen(false);
    } catch {
      setError('Could not save your date of birth. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm bg-[#0b1a30] border border-white/10 rounded-2xl p-6" role="dialog" aria-modal="true" aria-labelledby="dob-gate-title">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-5 h-5 text-emerald-400 shrink-0" />
          <h2 id="dob-gate-title" className="text-white font-bold text-lg">Confirm you are 18 or older</h2>
        </div>
        <p className="text-[#9cb8d9] text-sm mb-4">
          PH Labs supplies research compounds to customers aged 18+. Please confirm your date of birth to continue.
        </p>
        <label htmlFor="dob-gate-input" className="block text-xs text-[#9cb8d9] mb-1.5">Date of birth</label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a5a82] pointer-events-none" />
          <input
            id="dob-gate-input"
            type="date"
            value={value}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => { setValue(e.target.value); setError(''); }}
            className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white pl-9 pr-3 text-sm"
          />
        </div>
        {error && <p className="mt-2 text-red-400 text-xs">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={saving || !value}
          className="mt-4 w-full min-h-[48px] rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Confirm and continue
        </button>
        <p className="mt-3 text-[10px] text-[#3a5a82] text-center">
          For Research Use Only. Not for Human Consumption.
        </p>
      </div>
    </div>
  );
}

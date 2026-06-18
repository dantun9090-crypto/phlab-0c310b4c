import { useState } from 'react';
import { z } from 'zod';
import { ShieldCheck, CheckCircle2, Loader2, Mail, FileText } from 'lucide-react';
import { db, addDoc, collection, Timestamp } from '@/lib/firebase';
import { useSEO } from '@/hooks/useSEO';

type RequestType = 'access' | 'rectification' | 'deletion' | 'portability' | 'objection' | 'restriction';

const REQUEST_TYPES: { id: RequestType; label: string; description: string }[] = [
  { id: 'access', label: 'Access my data', description: 'Receive a copy of the personal data we hold about you (Art. 15 GDPR).' },
  { id: 'rectification', label: 'Correct my data', description: 'Update inaccurate or incomplete personal data (Art. 16 GDPR).' },
  { id: 'deletion', label: 'Delete my data', description: '"Right to be forgotten" — erase your account and personal data (Art. 17 GDPR).' },
  { id: 'portability', label: 'Export my data', description: 'Receive your data in a portable, machine-readable format (Art. 20 GDPR).' },
  { id: 'objection', label: 'Object to processing', description: 'Object to processing based on legitimate interest or marketing (Art. 21 GDPR).' },
  { id: 'restriction', label: 'Restrict processing', description: 'Temporarily limit how we use your data (Art. 18 GDPR).' },
];

const schema = z.object({
  type: z.enum(['access', 'rectification', 'deletion', 'portability', 'objection', 'restriction']),
  email: z.string().trim().email('Please enter a valid email').max(255),
  fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
  details: z.string().trim().max(2000).optional().or(z.literal('')),
  confirm: z.literal(true, { errorMap: () => ({ message: 'You must confirm the request is genuine' }) }),
});

export default function PrivacyRequests() {
  useSEO('privacy-requests', {
    title: 'Privacy Requests (GDPR/DSR) — PH Labs',
    metaDescription: 'Exercise your GDPR rights: request access, correction, deletion, export, or object to processing of your personal data held by PH Labs.',
    canonical: 'https://phlabs.co.uk/privacy-requests',
  });

  const [type, setType] = useState<RequestType>('access');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [details, setDetails] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ type, email, fullName, details, confirm });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Please check the form');
      return;
    }
    setSubmitting(true);
    try {
      const ref = await addDoc(collection(db, 'dsrRequests'), {
        type: parsed.data.type,
        email: parsed.data.email.toLowerCase(),
        fullName: parsed.data.fullName,
        details: parsed.data.details ?? '',
        status: 'pending',
        createdAt: Timestamp.now(),
        source: 'privacy-requests-form',
      });
      setDone(ref.id);
    } catch (err) {
      console.error('[dsr] submit failed', err);
      setError('We could not submit your request. Please email privacy@phlabs.co.uk directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-950 text-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Privacy Requests</h1>
            <p className="text-sm text-slate-400">Exercise your rights under the UK GDPR.</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6 text-sm text-slate-300 leading-relaxed">
          <p className="mb-2">
            You can ask us to <strong>access, correct, delete, export, restrict</strong> or <strong>object</strong> to processing of
            the personal data we hold about you. We respond within <strong>30 days</strong>, free of charge.
          </p>
          <p className="text-slate-400">
            Prefer email? Write to{' '}
            <a href="mailto:privacy@phlabs.co.uk" className="text-emerald-400 hover:underline">privacy@phlabs.co.uk</a>{' '}
            with the request type and the email you use with PH Labs.
          </p>
        </div>

        {done ? (
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 space-y-5">
            <div className="text-center space-y-2">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
              <h2 className="text-xl font-bold">Request received</h2>
              <p className="text-sm text-slate-300">
                Your reference number is{' '}
                <span className="inline-block font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-0.5 select-all">
                  {done.slice(0, 8).toUpperCase()}
                </span>
              </p>
              <p className="text-xs text-slate-400">
                Save this reference — quote it in any follow-up email.
              </p>
            </div>

            <div className="border-t border-slate-800 pt-5">
              <p className="text-xs font-bold tracking-wider uppercase text-slate-400 mb-3">
                What happens next
              </p>
              <ol className="space-y-3">
                {[
                  {
                    n: 1,
                    title: 'Identity verification (within 72 hours)',
                    body: <>We'll email <strong className="text-slate-200">{email}</strong> from <span className="font-mono">privacy@phlabs.co.uk</span> to confirm the request came from you. Reply to that email to verify.</>,
                  },
                  {
                    n: 2,
                    title: 'Request processed (within 30 days)',
                    body: <>Once verified, our DPO completes your request. Article 12(3) UK GDPR allows one 2-month extension for complex requests — we'll tell you if that applies.</>,
                  },
                  {
                    n: 3,
                    title: 'Outcome delivered',
                    body: <>Access / export requests: encrypted JSON download. Deletion: confirmation that your customer record and personal data have been erased (anonymised where retention is legally required, e.g. invoices kept for 6 years under HMRC rules).</>,
                  },
                ].map(step => (
                  <li key={step.n} className="flex gap-3">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center">
                      {step.n}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{step.title}</p>
                      <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="border-t border-slate-800 pt-4 text-xs text-slate-400 space-y-1">
              <p>
                <strong className="text-slate-200">Not happy with our response?</strong> You can complain to the
                UK Information Commissioner's Office at{' '}
                <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
                  ico.org.uk
                </a>.
              </p>
            </div>

            <button
              type="button"
              onClick={() => { setDone(null); setDetails(''); setConfirm(false); }}
              className="text-sm text-slate-400 hover:text-white underline w-full text-center"
            >
              Submit another request
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">

            <div className="space-y-2">
              <label className="text-xs font-bold tracking-wider uppercase text-slate-400 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Request type
              </label>
              <div className="grid sm:grid-cols-2 gap-2">
                {REQUEST_TYPES.map(rt => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => setType(rt.id)}
                    className={`text-left p-3 rounded-xl border-2 transition ${
                      type === rt.id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <p className="text-sm font-semibold">{rt.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{rt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="dsr-name" className="text-xs font-bold tracking-wider uppercase text-slate-400 block mb-1.5">
                  Full name
                </label>
                <input
                  id="dsr-name"
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  maxLength={120}
                  className="w-full min-h-[48px] border-2 border-slate-600 bg-slate-800 text-white rounded-lg px-3 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="dsr-email" className="text-xs font-bold tracking-wider uppercase text-slate-400 block mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3 h-3" /> Email on file
                </label>
                <input
                  id="dsr-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  className="w-full min-h-[48px] border-2 border-slate-600 bg-slate-800 text-white rounded-lg px-3 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="dsr-details" className="text-xs font-bold tracking-wider uppercase text-slate-400 block mb-1.5">
                Additional details (optional)
              </label>
              <textarea
                id="dsr-details"
                value={details}
                onChange={e => setDetails(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="E.g. order numbers, specific data fields, reason for the request…"
                className="w-full min-h-[120px] border-2 border-slate-600 bg-slate-800 text-white rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none resize-y"
              />
              <p className="text-[10px] text-slate-500 mt-1 text-right">{details.length}/2000</p>
            </div>

            <label className="flex items-start gap-3 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={confirm}
                onChange={e => setConfirm(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-emerald-500"
              />
              <span className="leading-snug">
                I confirm this request is genuine and the email above is mine. I understand PH Labs may need to
                verify my identity before fulfilling the request.
              </span>
            </label>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-bold rounded-xl transition flex items-center justify-center gap-2"
            >
              {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>) : 'Submit request'}
            </button>

            <p className="text-[11px] text-slate-500 text-center">
              We process this request under Art. 12 UK GDPR. Records are kept for 3 years for compliance auditing.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

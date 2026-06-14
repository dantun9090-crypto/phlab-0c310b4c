import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package2, MapPin, Mail, Phone, Scale, Truck, CheckCircle2, AlertTriangle, Loader2, Copy, ExternalLink, RotateCcw, Download } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { createRoyalMailOrder } from '@/lib/royal-mail.functions';
import { logAdminAction } from '@/lib/admin-audit';

// Royal Mail service codes (Click & Drop). Curated to the services PH Labs uses.
const SERVICES: { code: string; name: string; eta: string; tracked: boolean }[] = [
  { code: 'TPN24',  name: 'Tracked 24',         eta: '1 working day',  tracked: true },
  { code: 'TPN48',  name: 'Tracked 48',         eta: '2-3 working days', tracked: true },
  { code: 'SD1',    name: 'Special Delivery 1pm', eta: 'Next day by 1pm', tracked: true },
  { code: 'SD9',    name: 'Special Delivery 9am', eta: 'Next day by 9am', tracked: true },
  { code: 'CRL1',   name: '1st Class Signed For', eta: '1 working day', tracked: true },
  { code: 'CRL2',   name: '2nd Class Signed For', eta: '2-3 working days', tracked: true },
  { code: 'STL1',   name: '1st Class Letter',   eta: '1 working day',  tracked: false },
  { code: 'STL2',   name: '2nd Class Letter',   eta: '2-3 working days', tracked: false },
];

const WEIGHT_PRESETS = [
  { g: 50,   label: 'Letter' },
  { g: 100,  label: 'Small' },
  { g: 250,  label: 'Medium' },
  { g: 500,  label: 'Large' },
  { g: 1000, label: '1 kg' },
  { g: 2000, label: '2 kg' },
];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  serviceCode: string;
  weightGrams: number;
  reference: string;
  declaredValue: number;
}

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  postcode: '',
  serviceCode: 'TPN24',
  weightGrams: 100,
  reference: '',
  declaredValue: 0,
};

const inputCls =
  'w-full min-h-[48px] px-4 bg-slate-800 border-2 border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all text-[14px]';
const labelCls = 'block text-[11px] font-semibold tracking-wide uppercase text-blue-400/70 mb-1.5';

export default function RoyalMailTab() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<{ orderId: string; trackingNumber: string | null } | null>(null);
  const [copied, setCopied] = useState<string>('');

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (error) setError('');
  };

  const service = SERVICES.find((s) => s.code === form.serviceCode) ?? SERVICES[0];

  const validate = (): string | null => {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'First and last name required';
    if (!form.addressLine1.trim()) return 'Address line 1 required';
    if (!form.postcode.trim()) return 'Postcode required';
    if (!/^[A-Z0-9 ]{4,10}$/i.test(form.postcode.trim())) return 'Postcode looks invalid';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Valid email required';
    if (form.weightGrams < 1 || form.weightGrams > 30000) return 'Weight must be 1–30000 g';
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const idToken = (await auth.currentUser?.getIdToken()) ?? '';
      if (!idToken) throw new Error('You must be signed in as an admin.');

      const reference = form.reference.trim() || `MANUAL-${Date.now().toString(36).toUpperCase()}`;

      const res = await createRoyalMailOrder({
        data: {
          idToken,
          orderId: reference,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          addressLine1: form.addressLine1.trim(),
          addressLine2: form.addressLine2.trim(),
          city: form.city.trim(),
          postcode: form.postcode.trim().toUpperCase(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          countryCode: 'GB',
          serviceCode: form.serviceCode,
          weightGrams: Math.round(form.weightGrams),
          subtotal: form.declaredValue,
          shippingCostCharged: 0,
          total: form.declaredValue,
        },
      });

      if (!res.ok) {
        throw new Error(`${res.error ?? 'Failed to create label'}${res.details ? ' — ' + res.details : ''}`);
      }

      const orderId = String(res.orderId ?? '').trim();
      const tracking = res.trackingNumber ? String(res.trackingNumber) : null;
      if (!orderId) throw new Error('Worker did not return an orderId');

      setResult({ orderId, trackingNumber: tracking });

      logAdminAction({
        action: 'royal_mail.manual_label_create',
        target: `royal_mail/${orderId}`,
        after: {
          reference,
          serviceCode: form.serviceCode,
          weightGrams: form.weightGrams,
          postcode: form.postcode.toUpperCase(),
          tracking,
        },
      }).catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'Failed to create label');
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1400);
    });
  };

  const reset = () => { setForm(emptyForm); setResult(null); setError(''); };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)]">
              <Package2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-white text-xl sm:text-2xl font-bold">Royal Mail Label Creator</h1>
          </div>
          <p className="text-slate-400 text-[13px] ml-11">
            Create a one-off Click &amp; Drop label — for returns, B2B, or manual fulfilment.
          </p>
        </div>
        {(result || form.firstName) && (
          <button
            onClick={reset}
            className="flex items-center gap-2 px-3 py-2 text-[12px] text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      {/* ── Result banner ── */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl p-5 border border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-slate-900"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-emerald-300 font-semibold text-[15px] mb-2">Label created</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <KeyValue
                    label="Order ID"
                    value={result.orderId}
                    onCopy={() => copy(result.orderId, 'order')}
                    copied={copied === 'order'}
                  />
                  {result.trackingNumber && (
                    <KeyValue
                      label="Tracking"
                      value={result.trackingNumber}
                      onCopy={() => copy(result.trackingNumber!, 'track')}
                      copied={copied === 'track'}
                      extra={
                        <a
                          href={`https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(result.trackingNumber)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 text-[11px]"
                        >
                          Track <ExternalLink className="w-3 h-3" />
                        </a>
                      }
                    />
                  )}
                </div>
                <p className="text-slate-400 text-[11px] mt-3">
                  Download the PDF label from{' '}
                  <a href="https://business.parcel.royalmail.com/" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">Click &amp; Drop</a>.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 rounded-xl p-4 border border-red-500/30 bg-red-950/40"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-200 text-[13px] break-words">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Address card ── */}
        <Card className="lg:col-span-2" icon={<MapPin className="w-4 h-4" />} title="Recipient">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="First name" required>
              <input className={inputCls} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="John" />
            </Field>
            <Field label="Last name" required>
              <input className={inputCls} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Smith" />
            </Field>
            <Field label="Address line 1" required>
              <input className={inputCls} value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} placeholder="12 Baker Street" />
            </Field>
            <Field label="Address line 2">
              <input className={inputCls} value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} placeholder="Apt 4B" />
            </Field>
            <Field label="City / Town">
              <input className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="London" />
            </Field>
            <Field label="Postcode" required>
              <input
                className={`${inputCls} uppercase tracking-wider font-mono`}
                value={form.postcode}
                onChange={(e) => set('postcode', e.target.value.toUpperCase())}
                placeholder="SW1A 1AA"
                maxLength={10}
              />
            </Field>
            <Field label="Email" required icon={<Mail className="w-3 h-3" />}>
              <input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="recipient@example.com" />
            </Field>
            <Field label="Phone" icon={<Phone className="w-3 h-3" />}>
              <input type="tel" className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07700 900000" />
            </Field>
          </div>
        </Card>

        {/* ── Service + weight card ── */}
        <Card icon={<Truck className="w-4 h-4" />} title="Service & Package">
          <Field label="Service">
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {SERVICES.map((s) => {
                const active = s.code === form.serviceCode;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => set('serviceCode', s.code)}
                    className="w-full text-left p-3 rounded-lg border-2 transition-all"
                    style={{
                      borderColor: active ? 'rgb(59 130 246)' : 'rgb(51 65 85)',
                      background: active ? 'rgba(59,130,246,0.12)' : 'rgba(30,41,59,0.6)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[13px] font-semibold ${active ? 'text-blue-200' : 'text-white'}`}>{s.name}</span>
                      {s.tracked && (
                        <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Tracked
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{s.eta} · <span className="font-mono text-slate-500">{s.code}</span></p>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Weight" icon={<Scale className="w-3 h-3" />}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {WEIGHT_PRESETS.map((p) => (
                <button
                  key={p.g}
                  type="button"
                  onClick={() => set('weightGrams', p.g)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors"
                  style={{
                    borderColor: form.weightGrams === p.g ? 'rgb(59 130 246)' : 'rgb(51 65 85)',
                    color: form.weightGrams === p.g ? 'rgb(147 197 253)' : 'rgb(148 163 184)',
                    background: form.weightGrams === p.g ? 'rgba(59,130,246,0.1)' : 'transparent',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={30000}
                className={inputCls + ' pr-12'}
                value={form.weightGrams}
                onChange={(e) => set('weightGrams', Math.max(1, Number(e.target.value) || 1))}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-[12px] font-mono">g</span>
            </div>
          </Field>

          <Field label="Reference (optional)">
            <input
              className={inputCls}
              value={form.reference}
              onChange={(e) => set('reference', e.target.value)}
              placeholder="Auto-generated if blank"
            />
          </Field>

          <Field label="Declared value (£)">
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputCls}
              value={form.declaredValue}
              onChange={(e) => set('declaredValue', Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
        </Card>
      </div>

      {/* ── Label preview ── */}
      <LabelPreview form={form} service={service} />


      {/* ── Footer summary + submit ── */}
      <div
        className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 backdrop-blur-md border-t flex items-center justify-between gap-3 flex-wrap"
        style={{ background: 'rgba(4,12,24,0.85)', borderColor: 'rgba(59,130,246,0.15)' }}
      >
        <div className="flex items-center gap-4 text-[12px]">
          <div>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest">Service</p>
            <p className="text-white font-semibold">{service.name}</p>
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest">Weight</p>
            <p className="text-white font-semibold font-mono">{form.weightGrams} g</p>
          </div>
          {form.postcode && (
            <>
              <div className="h-8 w-px bg-slate-700" />
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest">To</p>
                <p className="text-white font-semibold font-mono uppercase">{form.postcode}</p>
              </div>
            </>
          )}
        </div>
        <button
          onClick={submit}
          disabled={loading}
          className="min-h-[48px] px-6 rounded-xl font-semibold text-[14px] text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          style={{
            background: loading
              ? 'rgb(51 65 85)'
              : 'linear-gradient(135deg, rgb(220 38 38) 0%, rgb(185 28 28) 100%)',
            boxShadow: loading ? 'none' : '0 8px 24px -8px rgba(220,38,38,0.6)',
          }}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating label…</>
          ) : (
            <><Package2 className="w-4 h-4" /> Create Royal Mail label</>
          )}
        </button>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function Card({ title, icon, children, className = '' }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 border ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(2,8,20,0.9) 100%)',
        borderColor: 'rgba(59,130,246,0.15)',
      }}
    >
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">{icon}</div>
        <h2 className="text-white font-semibold text-[14px]">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, required, icon, children }: { label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
          {required && <span className="text-red-400">*</span>}
        </span>
      </label>
      {children}
    </div>
  );
}

function KeyValue({ label, value, onCopy, copied, extra }: { label: string; value: string; onCopy: () => void; copied: boolean; extra?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-900/60 border border-slate-700/60 p-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <code className="text-white text-[13px] font-mono truncate">{value}</code>
        <button
          onClick={onCopy}
          className="shrink-0 text-slate-400 hover:text-white transition-colors p-1 rounded"
          title="Copy"
        >
          {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      {extra && <div className="mt-2">{extra}</div>}
    </div>
  );
}

function LabelPreview({ form, service }: { form: FormState; service: typeof SERVICES[number] }) {
  const fullName = `${form.firstName || ''} ${form.lastName || ''}`.trim();
  const issues: string[] = [];
  if (!fullName) issues.push('Recipient name');
  if (!form.addressLine1.trim()) issues.push('Address line 1');
  if (!form.postcode.trim()) issues.push('Postcode');
  if (!form.email.trim()) issues.push('Email');
  const ready = issues.length === 0;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="rounded-2xl p-5 border" style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(2,8,20,0.9) 100%)', borderColor: 'rgba(59,130,246,0.15)' }}>
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <Package2 className="w-4 h-4" />
          </div>
          <h2 className="text-white font-semibold text-[14px]">Label preview</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadPreviewPdf(form, service)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-700 hover:border-blue-400/60 text-slate-300 hover:text-white bg-slate-800/60 transition-colors"
            title="Download a preview PDF for visual confirmation (not a real Royal Mail label)"
          >
            <Download className="w-3 h-3" /> Download PDF
          </button>
          <span
            className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded border"
            style={
              ready
                ? { background: 'rgba(16,185,129,0.12)', color: 'rgb(110 231 183)', borderColor: 'rgba(16,185,129,0.35)' }
                : { background: 'rgba(251,191,36,0.1)', color: 'rgb(252 211 77)', borderColor: 'rgba(251,191,36,0.35)' }
            }
          >
            {ready ? 'Ready' : `${issues.length} missing`}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Paper label mock */}
        <div
          className="relative rounded-lg p-4 font-mono text-[12px] text-slate-900 overflow-hidden"
          style={{
            background: 'repeating-linear-gradient(45deg, #fafaf7 0 10px, #f4f4ee 10px 20px)',
            boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(0,0,0,0.08)',
          }}
        >
          <div className="flex items-center justify-between border-b-2 border-red-600 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-sm bg-red-600 text-white flex items-center justify-center font-bold text-[10px]">RM</div>
              <span className="text-red-700 font-bold tracking-wide text-[11px]">ROYAL MAIL</span>
            </div>
            <span className="text-[9px] text-slate-600 tracking-wider uppercase">{today}</span>
          </div>

          <div className="mb-3">
            <p className="text-[8px] tracking-widest uppercase text-slate-500 mb-0.5">Service</p>
            <p className="font-bold text-[13px] leading-tight">{service.name}</p>
            <p className="text-[9px] text-slate-600">{service.code} · {form.weightGrams} g</p>
          </div>

          <div className="mb-3">
            <p className="text-[8px] tracking-widest uppercase text-slate-500 mb-1">Deliver to</p>
            <p className="font-bold text-[13px] leading-snug uppercase">{fullName || '—'}</p>
            <p className="text-[11px] leading-snug">{form.addressLine1 || '—'}</p>
            {form.addressLine2 && <p className="text-[11px] leading-snug">{form.addressLine2}</p>}
            {form.city && <p className="text-[11px] leading-snug">{form.city}</p>}
            <p className="font-bold text-[14px] mt-1 tracking-widest">{form.postcode || '—'}</p>
            <p className="text-[10px] text-slate-600">UNITED KINGDOM</p>
          </div>

          {/* Barcode placeholder */}
          <div className="flex items-end gap-[2px] h-10 mt-2">
            {Array.from({ length: 42 }).map((_, i) => (
              <div
                key={i}
                className="bg-slate-900"
                style={{
                  width: (i * 7) % 3 === 0 ? 3 : 1,
                  height: `${60 + ((i * 13) % 40)}%`,
                  opacity: ready ? 1 : 0.4,
                }}
              />
            ))}
          </div>
          <p className="text-center text-[10px] tracking-[0.3em] mt-1 text-slate-700">
            {form.reference.trim() || 'AUTO-REF-' + (form.postcode.replace(/\s/g, '').slice(0, 6) || '------').toUpperCase()}
          </p>

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
              <span className="rotate-[-12deg] text-red-600/80 border-2 border-red-600/80 px-3 py-1 font-bold tracking-widest text-[11px]">
                INCOMPLETE
              </span>
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          <Row label="Recipient" value={fullName || '—'} ok={!!fullName} />
          <Row label="Address" value={[form.addressLine1, form.addressLine2, form.city].filter(Boolean).join(', ') || '—'} ok={!!form.addressLine1.trim()} />
          <Row label="Postcode" value={form.postcode || '—'} ok={!!form.postcode.trim()} mono />
          <Row label="Email" value={form.email || '—'} ok={!!form.email.trim()} />
          <Row label="Phone" value={form.phone || '—'} ok={true} muted={!form.phone} />
          <Row label="Service" value={`${service.name} (${service.code})`} ok />
          <Row label="Weight" value={`${form.weightGrams} g`} ok mono />
          <Row label="Declared value" value={`£${form.declaredValue.toFixed(2)}`} ok={true} muted={form.declaredValue === 0} />
        </div>
      </div>

      {!ready && (
        <p className="mt-4 text-[12px] text-amber-300/90 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Missing: {issues.join(', ')}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, ok, mono, muted }: { label: string; value: string; ok: boolean; mono?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 pb-2 border-b border-white/5">
      <span className="text-[11px] uppercase tracking-widest text-slate-500 shrink-0 pt-0.5">{label}</span>
      <span className={`text-[13px] text-right break-words ${mono ? 'font-mono' : ''} ${muted ? 'text-slate-500' : ok ? 'text-white' : 'text-amber-300'}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Generate a preview-only PDF that mirrors the on-screen label mock.
 * NOT a real Royal Mail label — Click & Drop must issue the real one.
 * 6" × 4" landscape (standard shipping label size).
 */
async function downloadPreviewPdf(form: FormState, service: typeof SERVICES[number]) {
  const { default: jsPDF } = await import('jspdf');
  // 6in x 4in @ 72pt = 432 x 288 pt
  const W = 432, H = 288;
  const doc = new jsPDF({ unit: 'pt', format: [W, H], orientation: 'landscape' });

  // Border
  doc.setDrawColor(0); doc.setLineWidth(1);
  doc.rect(8, 8, W - 16, H - 16);

  // Header bar
  doc.setFillColor(220, 38, 38);
  doc.rect(8, 8, W - 16, 32, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ROYAL MAIL', 20, 30);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('PREVIEW ONLY — NOT A VALID POSTAGE LABEL', W - 20, 30, { align: 'right' });

  // Service block
  doc.setTextColor(0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICE', 20, 58);
  doc.setFontSize(13);
  doc.text(service.name, 20, 74);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${service.code}  ·  ${form.weightGrams} g  ·  ${service.eta}`, 20, 88);

  // Sender (right side, top)
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('FROM', W - 150, 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('PH Labs', W - 150, 70);
  doc.text('phlabs.co.uk', W - 150, 82);

  // Divider
  doc.setDrawColor(180); doc.setLineWidth(0.5);
  doc.line(20, 98, W - 20, 98);

  // Deliver To
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80);
  doc.text('DELIVER TO', 20, 114);

  doc.setTextColor(0);
  let y = 130;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`${form.firstName} ${form.lastName}`.trim().toUpperCase() || '—', 20, y);
  y += 16;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const lines = [form.addressLine1, form.addressLine2, form.city].filter(Boolean);
  for (const line of lines) { doc.text(line, 20, y); y += 14; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(form.postcode.toUpperCase() || '—', 20, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('UNITED KINGDOM', 20, y + 18);

  // Reference + meta (bottom right)
  const ref = form.reference.trim() || `PREVIEW-${Date.now().toString(36).toUpperCase()}`;
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text('REFERENCE', W - 150, H - 60);
  doc.setTextColor(0);
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text(ref, W - 150, H - 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, W - 150, H - 36);
  if (form.declaredValue > 0) doc.text(`Declared value: £${form.declaredValue.toFixed(2)}`, W - 150, H - 24);

  // Pseudo-barcode strip (bottom-left)
  const bx = 20, by = H - 60, bw = 220, bh = 36;
  doc.setFillColor(0, 0, 0);
  let cursor = bx;
  let i = 0;
  while (cursor < bx + bw) {
    const w = (i * 7) % 3 === 0 ? 2.4 : 0.9;
    doc.rect(cursor, by, w, bh, 'F');
    cursor += w + 1.4;
    i++;
  }
  doc.setFontSize(8);
  doc.setFont('courier', 'normal');
  doc.setTextColor(0);
  doc.text(ref, bx + bw / 2, by + bh + 10, { align: 'center' });

  const fname = `RM-preview-${(form.postcode.replace(/\s/g, '') || 'label').toUpperCase()}.pdf`;
  doc.save(fname);
}



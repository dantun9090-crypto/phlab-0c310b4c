/**
 * Admin → Webhook Test
 *
 * Self-contained Wallid webhook verification harness. Runs the entire pipeline
 * end-to-end against the LIVE receiver at /api/public/hooks/wallid:
 *   - Builds + signs a fake event server-side (secret never leaves the worker)
 *   - Posts it to the real endpoint
 *   - Reads back the persisted wallid_webhook_events row
 *   - Shows wallid_payments status before/after
 *
 * Use this before flipping Wallid live in the dashboard.
 */
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { Loader2, Send, ShieldAlert, Clock, Copy, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  sendTestWallidWebhook,
  listRecentWebhookEvents,
} from '@/lib/wallid-webhook-test.functions';

type EventType = 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'PENDING';
type Mode = 'normal' | 'bad-sig' | 'stale' | 'duplicate';

interface SendResult {
  ok: boolean;
  error?: string;
  request?: {
    url: string;
    timestamp: number;
    signature: string;
    realSignature: string;
    mode: Mode;
    eventId: string;
    payload: unknown;
  };
  response?: { status: number; body: string };
  duplicateResponse?: { status: number; body: string } | null;
  stored?: Record<string, unknown> | null;
  payment?: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };
}

function copy(text: string) {
  try { navigator.clipboard?.writeText(text); } catch { /* noop */ }
}

function pretty(v: unknown) {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function StatusPill({ code }: { code: number | undefined }) {
  if (code == null) return null;
  const tone =
    code >= 200 && code < 300 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : code >= 400 && code < 500 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    : 'bg-red-500/15 text-red-300 border-red-500/30';
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-mono border ${tone}`}>{code}</span>
  );
}

export default function WebhookTestTab() {
  const [eventType, setEventType] = useState<EventType>('SUCCESS');
  const [orderId, setOrderId] = useState('test-order-' + Date.now());
  const [apiPaymentId, setApiPaymentId] = useState('test-api-payment-id-123');
  const [amount, setAmount] = useState<number>(1999);
  const [sending, setSending] = useState<Mode | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [recent, setRecent] = useState<Array<Record<string, unknown>>>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  async function getIdToken(): Promise<string> {
    const u = auth.currentUser;
    if (!u) throw new Error('Not signed in');
    return u.getIdToken();
  }

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const idToken = await getIdToken();
      const res = await listRecentWebhookEvents({ data: { idToken } });
      if (res.ok) setRecent(res.rows as Array<Record<string, unknown>>);
    } catch {
      /* ignore */
    } finally {
      setLoadingRecent(false);
    }
  }

  useEffect(() => { void loadRecent(); }, []);

  async function send(mode: Mode) {
    setSending(mode);
    setResult(null);
    try {
      const idToken = await getIdToken();
      const res = await sendTestWallidWebhook({
        data: { idToken, eventType, orderId, apiPaymentId, amount, mode },
      });
      setResult(res as SendResult);
      await loadRecent();
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(null);
    }
  }

  const inputClass = 'w-full min-h-[48px] bg-slate-800 border-2 border-slate-600 rounded-lg px-3 text-white text-sm focus:border-blue-500 focus:outline-none';

  const Btn = ({ mode, label, icon: Icon, tone = 'blue' }: { mode: Mode; label: string; icon: typeof Send; tone?: 'blue' | 'amber' | 'red' | 'purple' }) => {
    const toneCls = {
      blue: 'bg-blue-600 hover:bg-blue-500',
      amber: 'bg-amber-600 hover:bg-amber-500',
      red: 'bg-red-600 hover:bg-red-500',
      purple: 'bg-purple-600 hover:bg-purple-500',
    }[tone];
    const isLoading = sending === mode;
    return (
      <button
        onClick={() => void send(mode)}
        disabled={sending !== null}
        className={`${toneCls} disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold min-h-[48px] px-4 rounded-lg flex items-center justify-center gap-2 transition`}
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-white text-2xl font-bold mb-1">Wallid Webhook Test</h1>
        <p className="text-slate-400 text-sm">
          End-to-end harness for <code className="text-blue-300">/api/public/hooks/wallid</code>.
          Signs requests server-side with <code>WALLID_WEBHOOK_SECRET</code> — the secret never
          touches this page.
        </p>
      </div>

      {/* Form */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-slate-300 text-xs font-semibold uppercase tracking-wide">Event type</span>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
              className={inputClass + ' mt-1'}
            >
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="PENDING">PENDING</option>
            </select>
          </label>
          <label className="block">
            <span className="text-slate-300 text-xs font-semibold uppercase tracking-wide">Amount (pence)</span>
            <input
              type="number"
              value={amount}
              min={1}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className={inputClass + ' mt-1'}
            />
          </label>
          <label className="block">
            <span className="text-slate-300 text-xs font-semibold uppercase tracking-wide">Order ID</span>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className={inputClass + ' mt-1'}
            />
          </label>
          <label className="block">
            <span className="text-slate-300 text-xs font-semibold uppercase tracking-wide">API Payment ID</span>
            <input
              type="text"
              value={apiPaymentId}
              onChange={(e) => setApiPaymentId(e.target.value)}
              className={inputClass + ' mt-1'}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
          <Btn mode="normal" label="Send Test Webhook" icon={Send} tone="blue" />
          <Btn mode="bad-sig" label="Test Invalid Signature" icon={ShieldAlert} tone="amber" />
          <Btn mode="stale" label="Test Stale Timestamp" icon={Clock} tone="amber" />
          <Btn mode="duplicate" label="Test Duplicate Event" icon={Copy} tone="purple" />
        </div>
        <p className="text-slate-500 text-xs flex items-start gap-2 pt-1">
          <AlertTriangle className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
          The "Missing Secret" case is verified by the receiver itself: it returns
          500 "Server misconfigured" if <code>WALLID_WEBHOOK_SECRET</code> is unset.
          We don't unset it from the UI — that would break live payments.
        </p>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Result</h2>
            {result.response && <StatusPill code={result.response.status} />}
          </div>

          {!result.ok && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-200 text-sm">
              {result.error || 'Unknown error'}
            </div>
          )}

          {result.request && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Section title="Request payload">
                <Pre json={result.request.payload} />
              </Section>
              <Section title="Headers">
                <Pre json={{
                  'X-Webhook-Timestamp': result.request.timestamp,
                  'X-Webhook-Event-Count': 1,
                  'X-Webhook-Signature': result.request.signature,
                  '(real signature for ref)': result.request.realSignature,
                  mode: result.request.mode,
                }} />
              </Section>
              <Section title="Response body">
                <Pre raw={result.response?.body} />
              </Section>
              <Section title="Database — wallid_webhook_events row">
                {result.stored
                  ? <Pre json={result.stored} />
                  : <p className="text-amber-300 text-xs">No row stored for <code>{result.request.eventId}</code> — the receiver rejected this request (expected for bad-sig / stale).</p>}
              </Section>
              <Section title="wallid_payments — before">
                {result.payment?.before ? <Pre json={result.payment.before} /> : <p className="text-slate-500 text-xs">No matching row.</p>}
              </Section>
              <Section title="wallid_payments — after">
                {result.payment?.after ? <Pre json={result.payment.after} /> : <p className="text-slate-500 text-xs">No matching row.</p>}
              </Section>
              {result.duplicateResponse && (
                <Section title="Duplicate replay — second response">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusPill code={result.duplicateResponse.status} />
                    <span className="text-xs text-slate-400">Expected: 200 with processed=0</span>
                  </div>
                  <Pre raw={result.duplicateResponse.body} />
                </Section>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent feed */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">Last 10 webhook events</h2>
          <button
            onClick={() => void loadRecent()}
            className="text-xs text-slate-300 hover:text-white flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRecent ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-slate-500 text-sm">No events yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 text-left">
                <tr>
                  <th className="py-1.5 pr-3">processed_at</th>
                  <th className="py-1.5 pr-3">status</th>
                  <th className="py-1.5 pr-3">event_id</th>
                  <th className="py-1.5 pr-3">order_id</th>
                  <th className="py-1.5 pr-3">api_payment_id</th>
                </tr>
              </thead>
              <tbody className="text-slate-200 font-mono">
                {recent.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{String(r.processed_at ?? '')}</td>
                    <td className="py-1.5 pr-3">{String(r.status ?? '')}</td>
                    <td className="py-1.5 pr-3 break-all">{String(r.event_id ?? '')}</td>
                    <td className="py-1.5 pr-3 break-all">{String(r.order_id ?? '')}</td>
                    <td className="py-1.5 pr-3 break-all">{String(r.api_payment_id ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">{title}</div>
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">{children}</div>
    </div>
  );
}

function Pre({ json, raw }: { json?: unknown; raw?: string }) {
  const text = json !== undefined ? pretty(json) : (raw ?? '');
  return (
    <div className="relative group">
      <button
        onClick={() => copy(text)}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700"
      >
        copy
      </button>
      <pre className="text-[11px] text-slate-200 whitespace-pre-wrap break-words overflow-x-auto max-h-64">{text}</pre>
    </div>
  );
}

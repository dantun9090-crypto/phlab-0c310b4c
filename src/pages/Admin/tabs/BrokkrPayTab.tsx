/**
 * Admin → BrokkrPay: full operator surface for the BrokkrPay card gateway.
 *
 * Sections:
 *   1. Status — credentials, environment (test/live from the key prefix), site
 *      readiness, whether a signing secret is stored.
 *   2. Checkout switch + GBP→USD rate — BrokkrPay settles whole USD only, so
 *      the rate here decides what the customer is charged.
 *   3. Webhook — one-click registration; the signing secret is stored
 *      server-side and never displayed.
 *   4. Test payment — create a real hosted checkout link (test card
 *      4242 4242 4242 4242 in test mode).
 *   5. Order tools — look up by BrokkrPay id or our order reference, re-send
 *      the link email, cancel a pending order.
 *   6. Recent signature-verified webhook deliveries.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  getBrokkrPayStatus,
  registerBrokkrPayWebhookFn,
  createBrokkrPayTestLink,
  lookupBrokkrPayOrder,
  resendBrokkrPayLinkEmail,
  cancelBrokkrPayOrderFn,
  listBrokkrPayWebhookEvents,
  checkBrokkrPayAmountFn,
  WEBHOOK_ENDPOINT,
  type BrokkrPayStatusResult,
  type BrokkrPayWebhookEventRow,
} from '@/lib/brokkrpay-admin.functions';
import {
  loadBrokkrPayConfig,
  saveBrokkrPayConfig,
  gbpPenceToUsdWhole,
  BROKKRPAY_DISCLOSURE,
} from '@/lib/brokkrpay-fx';

const inputClass =
  'w-full rounded-lg border-2 border-slate-600 bg-slate-800 px-3 text-white placeholder:text-slate-500 min-h-[48px] focus:outline-none focus:border-emerald-500';
const cardClass = 'bg-slate-900 border-2 border-slate-700 rounded-lg p-4 space-y-4';
const btnClass =
  'inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]';
const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border-2 border-slate-600 bg-slate-800 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 min-h-[48px]';

interface OrderRow {
  orderId: string;
  state: string;
  amount: number;
  currency: string;
  clientReference: string | null;
  paymentMethod: string | null;
  statusDetail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export default function BrokkrPayTab() {
  const [status, setStatus] = useState<BrokkrPayStatusResult | null>(null);
  const [statusBusy, setStatusBusy] = useState(true);
  const [statusErr, setStatusErr] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [rate, setRate] = useState('1.30');
  const [cfgBusy, setCfgBusy] = useState(false);

  const [hookBusy, setHookBusy] = useState(false);

  const [testAmount, setTestAmount] = useState('1');
  const [testEmail, setTestEmail] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testLink, setTestLink] = useState<{ url: string | null; reference: string; orderId: string | null } | null>(null);

  const [lookupValue, setLookupValue] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [events, setEvents] = useState<BrokkrPayWebhookEventRow[]>([]);
  const [eventsBusy, setEventsBusy] = useState(false);

  const [amountCheck, setAmountCheck] = useState<string>('');

  const refreshStatus = useCallback(async () => {
    setStatusBusy(true);
    setStatusErr('');
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      setStatus(await getBrokkrPayStatus({ data: { idToken } }));
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : 'Could not read BrokkrPay status');
    } finally {
      setStatusBusy(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    setEventsBusy(true);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) return;
      setEvents(await listBrokkrPayWebhookEvents({ data: { idToken, limit: 25 } }));
    } catch {
      /* non-fatal */
    } finally {
      setEventsBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshEvents();
    void loadBrokkrPayConfig().then((c) => {
      setEnabled(c.enabled);
      setRate(String(c.usdRate));
    });
  }, [refreshStatus, refreshEvents]);

  async function toggleEnabled(next: boolean) {
    setCfgBusy(true);
    try {
      await saveBrokkrPayConfig({ enabled: next });
      setEnabled(next);
      toast.success(next ? 'BrokkrPay is now ON at checkout' : 'BrokkrPay is now OFF at checkout');
    } catch {
      toast.error('Save failed — check admin permissions.');
    } finally {
      setCfgBusy(false);
    }
  }

  async function saveRate() {
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 3) {
      toast.error('Rate must be between 0.50 and 3.00');
      return;
    }
    setCfgBusy(true);
    try {
      await saveBrokkrPayConfig({ usdRate: parsed });
      toast.success(`GBP→USD rate saved: ${parsed}`);
    } catch {
      toast.error('Save failed — check admin permissions.');
    } finally {
      setCfgBusy(false);
    }
  }

  async function registerWebhook(disable = false) {
    setHookBusy(true);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await registerBrokkrPayWebhookFn({ data: { idToken, disable } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      await refreshStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Webhook registration failed');
    } finally {
      setHookBusy(false);
    }
  }

  async function runAmountCheck() {
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await checkBrokkrPayAmountFn({ data: { idToken } });
      setAmountCheck(
        res.allAmountsPayable
          ? 'Any whole-dollar amount is payable.'
          : res.pricePoints.length
            ? `Payable amounts: ${res.pricePoints.slice(0, 40).join(', ')}`
            : res.reason || 'No amount information returned.',
      );
    } catch (e) {
      setAmountCheck(e instanceof Error ? e.message : 'Amount check failed');
    }
  }

  async function createTest() {
    setTestBusy(true);
    setTestLink(null);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const amountUsd = Math.round(Number(testAmount || '1'));
      if (!Number.isInteger(amountUsd) || amountUsd < 1 || amountUsd > 500) {
        throw new Error('Test amount must be a whole number of dollars ($1–$500)');
      }
      const res = await createBrokkrPayTestLink({
        data: {
          idToken,
          amountUsd,
          ...(testEmail ? { customerEmail: testEmail, delivery: 'email' as const } : { delivery: 'direct' as const }),
        },
      });
      if (!res.ok) throw new Error(res.message);
      setTestLink({ url: res.checkoutUrl, reference: res.reference ?? '', orderId: res.brokkrOrderId });
      toast.success(res.message);
      if (res.checkoutUrl) {
        try {
          window.open(res.checkoutUrl, '_blank', 'noopener,noreferrer');
        } catch {
          /* popup blocked — link shown below */
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test link failed');
    } finally {
      setTestBusy(false);
    }
  }

  async function runLookup() {
    setLookupBusy(true);
    setOrders([]);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const value = lookupValue.trim();
      const isUuid = /^[0-9a-fA-F-]{36}$/.test(value);
      const res = await lookupBrokkrPayOrder({
        data: isUuid ? { idToken, brokkrOrderId: value } : { idToken, reference: value },
      });
      if (!res.ok) throw new Error(res.message);
      setOrders(res.orders as OrderRow[]);
      if (res.message) toast.info(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookupBusy(false);
    }
  }

  async function resendEmail(brokkrOrderId: string) {
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await resendBrokkrPayLinkEmail({ data: { idToken, brokkrOrderId } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Re-send failed');
    }
  }

  async function cancelOrder(brokkrOrderId: string) {
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await cancelBrokkrPayOrderFn({ data: { idToken, brokkrOrderId } });
      if (res.ok) {
        toast.success(res.message);
        await runLookup();
      } else toast.error(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  const rateNum = Number(rate) || 1.3;
  const preview = [3998, 5699, 8999].map((p) => ({ gbp: (p / 100).toFixed(2), usd: gbpPenceToUsdWhole(p, rateNum) }));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
        <div>
          <h2 className="text-xl font-bold text-white">BrokkrPay (card checkout)</h2>
          <p className="mt-1 text-sm text-slate-400">
            Secondary checkout method next to Pay by Bank. BrokkrPay settles in whole US dollars, so
            every order total is converted from GBP using the rate below. Pay by Bank (Wallid) is
            never affected by anything on this page.
          </p>
        </div>
      </div>

      {/* 1. Status */}
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Status</h3>
          <button type="button" onClick={() => void refreshStatus()} disabled={statusBusy} className={btnGhost}>
            {statusBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        {statusErr && (
          <p className="rounded-lg border-2 border-red-500 bg-red-500/10 px-3 py-2 text-sm text-red-200">{statusErr}</p>
        )}

        {status && (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="API key">
              {status.credentialsConfigured ? (
                <span className="text-emerald-300">{status.apiKeyMasked}</span>
              ) : (
                <span className="text-amber-300">not configured (BROKKRPAY_API_KEY missing)</span>
              )}
            </Row>
            <Row label="Environment">
              <span className={status.mode === 'live' ? 'text-amber-300' : 'text-emerald-300'}>
                {status.mode === 'live' ? 'LIVE — real money' : status.mode === 'test' ? 'TEST / sandbox' : 'unknown'}
              </span>
            </Row>
            <Row label="Signing secret stored">
              {status.webhookSecretStored ? (
                <span className="text-emerald-300">yes</span>
              ) : (
                <span className="text-amber-300">no — register the webhook below</span>
              )}
            </Row>
            <Row label="Checkout ready">
              {status.site ? (
                status.site.checkoutReady ? (
                  <span className="text-emerald-300">yes</span>
                ) : (
                  <span className="text-amber-300">{status.site.checkoutBlockedReason || 'blocked'}</span>
                )
              ) : (
                <span className="text-slate-400">{status.siteError || 'unknown'}</span>
              )}
            </Row>
            {status.site && (
              <>
                <Row label="Store">{status.site.name || status.site.storeId}</Row>
                <Row label="Registered webhook">
                  <span className="break-all text-slate-300">{status.site.webhookUrl || 'none'}</span>
                </Row>
              </>
            )}
          </dl>
        )}
      </div>

      {/* 2. Checkout switch + rate */}
      <div className={cardClass}>
        <h3 className="text-lg font-bold text-white">Checkout availability &amp; GBP→USD rate</h3>

        <div className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border-2 border-slate-600 bg-slate-800 px-4">
          <span className="text-sm font-medium text-white">
            Status:{' '}
            {enabled ? (
              <span className="text-emerald-400">ON — visible at checkout</span>
            ) : (
              <span className="text-amber-400">OFF — hidden at checkout</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void toggleEnabled(!enabled)}
            disabled={cfgBusy}
            aria-pressed={enabled}
            className={`my-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50 ${
              enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-500 hover:bg-emerald-600'
            }`}
          >
            {cfgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {enabled ? 'Turn OFF' : 'Turn ON'}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm text-slate-300">
            GBP → USD rate used at checkout
            <input
              type="number"
              step="0.01"
              min="0.5"
              max="3"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <button type="button" onClick={() => void saveRate()} disabled={cfgBusy} className={btnClass}>
            {cfgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save rate
          </button>
        </div>

        <div className="rounded-lg border-2 border-slate-600 bg-slate-800 p-3 text-sm text-slate-300">
          <p className="font-medium text-white">What customers would be charged at this rate</p>
          <ul className="mt-1 space-y-0.5">
            {preview.map((p) => (
              <li key={p.gbp}>
                £{p.gbp} → ${p.usd}.00
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Amounts always round up to the next whole dollar — BrokkrPay cannot charge cents.
          </p>
        </div>

        <div className="flex items-start gap-2 text-xs text-slate-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p>
            Required disclosure shown to the customer at checkout: “{BROKKRPAY_DISCLOSURE}”
          </p>
        </div>
      </div>

      {/* 3. Webhook */}
      <div className={cardClass}>
        <h3 className="text-lg font-bold text-white">Webhook</h3>
        <p className="text-sm text-slate-400">
          Registers <code className="break-all text-slate-300">{WEBHOOK_ENDPOINT}</code> for the
          current environment and stores the signing secret on the server. Orders are only marked
          paid from a signature-verified delivery.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void registerWebhook(false)} disabled={hookBusy} className={btnClass}>
            {hookBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Register / rotate secret
          </button>
          <button type="button" onClick={() => void registerWebhook(true)} disabled={hookBusy} className={btnGhost}>
            <X className="h-4 w-4" />
            Disable webhook
          </button>
          <button type="button" onClick={() => void runAmountCheck()} className={btnGhost}>
            <Search className="h-4 w-4" />
            Check payable amounts
          </button>
        </div>
        {amountCheck && <p className="text-sm text-slate-300">{amountCheck}</p>}
      </div>

      {/* 4. Test payment */}
      <div className={cardClass}>
        <h3 className="text-lg font-bold text-white">Test payment</h3>
        <p className="text-sm text-slate-400">
          Creates a real hosted checkout link with reference <code className="text-slate-300">TEST-…</code>. In test
          mode pay with card <code className="text-slate-300">4242 4242 4242 4242</code>. In live mode this moves real
          money — abandon the page to test only the redirect.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm text-slate-300">
            Amount (whole USD)
            <input type="number" min="1" max="500" value={testAmount} onChange={(e) => setTestAmount(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-sm text-slate-300 sm:col-span-2">
            Email the link instead (optional)
            <input
              type="email"
              placeholder="leave blank to open the link directly"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
        <button type="button" onClick={() => void createTest()} disabled={testBusy} className={btnClass}>
          {testBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Create test payment
        </button>
        {testLink && (
          <div className="rounded-lg border-2 border-emerald-500 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Reference {testLink.reference}
            </p>
            {testLink.orderId && <p className="mt-1 break-all text-xs">BrokkrPay order: {testLink.orderId}</p>}
            {testLink.url && (
              <a href={testLink.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 underline">
                Open checkout <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* 5. Order tools */}
      <div className={cardClass}>
        <h3 className="text-lg font-bold text-white">Order lookup &amp; management</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm text-slate-300">
            BrokkrPay order id (UUID) or our order reference (PHP-…)
            <input value={lookupValue} onChange={(e) => setLookupValue(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <button type="button" onClick={() => void runLookup()} disabled={lookupBusy || lookupValue.trim().length < 3} className={btnClass}>
            {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Look up
          </button>
        </div>

        {orders.length > 0 && (
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.orderId} className="rounded-lg border-2 border-slate-600 bg-slate-800 p-3 text-sm text-slate-300">
                <p className="break-all font-medium text-white">{o.orderId}</p>
                <p className="mt-1">
                  State: <span className="text-emerald-300">{o.state}</span> · ${o.amount} {o.currency}
                  {o.paymentMethod ? ` · ${o.paymentMethod}` : ''}
                </p>
                {o.clientReference && <p className="mt-1">Our reference: {o.clientReference}</p>}
                {o.statusDetail && <p className="mt-1 text-slate-400">{o.statusDetail}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void resendEmail(o.orderId)} className={btnGhost}>
                    Re-send link email
                  </button>
                  <button type="button" onClick={() => void cancelOrder(o.orderId)} className={btnGhost}>
                    Cancel order
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Webhook deliveries */}
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Recent webhook deliveries</h3>
          <button type="button" onClick={() => void refreshEvents()} disabled={eventsBusy} className={btnGhost}>
            {eventsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No signature-verified deliveries recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Received</th>
                  <th className="py-2 pr-3">Our order</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">USD</th>
                  <th className="py-2">Test</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-slate-800">
                    <td className="py-2 pr-3">{e.receivedAt ? new Date(e.receivedAt).toLocaleString('en-GB') : '—'}</td>
                    <td className="py-2 pr-3">{e.orderId ?? '—'}</td>
                    <td className="py-2 pr-3">{e.state ?? '—'}</td>
                    <td className="py-2 pr-3">{e.amountUsd ?? '—'}</td>
                    <td className="py-2">{e.test ? 'yes' : 'no'}</td>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-slate-600 bg-slate-800 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-white">{children}</dd>
    </div>
  );
}

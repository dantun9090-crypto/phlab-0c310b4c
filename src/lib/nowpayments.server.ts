/**
 * NOWPayments (nowpayments.io) hosted-invoice server helper.
 *
 * SERVER ONLY (`.server.ts` is blocked from client bundles).
 *
 * Flow used (hosted invoice — the customer never enters crypto details on our
 * site):
 *   1. POST {BASE}/invoice          — create an invoice, redirect to invoice_url
 *   2. GET  {BASE}/payment/{id}     — poll a payment (IPN fallback)
 *   3. POST → /api/public/nowpayments-webhook (signed IPN callback)
 *
 * Money model: the shopper pays in the crypto of their choice; NOWPayments
 * auto-converts and settles to the payout wallet configured in the dashboard
 * (USDT TRC20 for PH Labs). Prices are always quoted in GBP.
 *
 * Env (read INSIDE functions — Workers inject env per request):
 *   NOWPAYMENTS_API_KEY          dashboard → Settings → Payments → API keys
 *   NOWPAYMENTS_IPN_SECRET       dashboard → Settings → Payments → IPN secret
 *   NOWPAYMENTS_PAYOUT_CURRENCY  optional, e.g. `usdttrc20` (else account default)
 *   NOWPAYMENTS_PAY_CURRENCY     optional, coin the invoice opens on (default `usdttrc20`)
 */
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";

const NOWPAYMENTS_BASE = "https://api.nowpayments.io/v1";
const TIMEOUT_MS = 12_000;

export class NowPaymentsError extends Error {
  status: number;
  body: string;
  userMessage: string;
  constructor(status: number, body: string, userMessage: string) {
    super(`NOWPayments ${status}: ${body.slice(0, 200)}`);
    this.name = "NowPaymentsError";
    this.status = status;
    this.body = body;
    this.userMessage = userMessage;
  }
}

export interface NowPaymentsCredentials {
  apiKey: string | null;
  ipnSecret: string | null;
  payoutCurrency: string | null;
  /** Coin the hosted invoice opens on (default `usdttrc20`). */
  payCurrency: string | null;
}

export function readNowPaymentsCredentials(): NowPaymentsCredentials {
  const payout = (process.env["NOWPAYMENTS_PAYOUT_CURRENCY"] || "").trim().toLowerCase();
  const pay = (process.env["NOWPAYMENTS_PAY_CURRENCY"] || "usdttrc20").trim().toLowerCase();
  return {
    apiKey: process.env["NOWPAYMENTS_API_KEY"] || null,
    ipnSecret: process.env["NOWPAYMENTS_IPN_SECRET"] || null,
    payoutCurrency: /^[a-z0-9]{2,20}$/.test(payout) ? payout : null,
    payCurrency: /^[a-z0-9]{2,20}$/.test(pay) ? pay : null,
  };
}

/**
 * Minimum payable amount for a coin, expressed in GBP.
 *
 * NOWPayments refuses (and the hosted page shows "currently unavailable") when
 * the invoice total is under the coin's network minimum, so we only pin a
 * preferred coin when the order clears it. Returns null when unknown.
 */
async function payCurrencyMinGbp(coin: string): Promise<number | null> {
  try {
    const res = await npFetch(
      `/min-amount?currency_from=${encodeURIComponent(coin)}&currency_to=${encodeURIComponent(coin)}&fiat_equivalent=gbp`,
      { method: "GET" },
    );
    if (!res.ok) return null;
    const parsed = JSON.parse(await res.text()) as Record<string, unknown>;
    const gbp = Number(parsed.fiat_equivalent);
    return Number.isFinite(gbp) && gbp > 0 ? gbp : null;
  } catch {
    return null;
  }
}


export function isNowPaymentsConfigured(): boolean {
  return Boolean(readNowPaymentsCredentials().apiKey);
}

async function npFetch(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  const { apiKey } = readNowPaymentsCredentials();
  try {
    return await fetch(`${NOWPAYMENTS_BASE}${path}`, {
      ...init,
      // A cross-origin redirect strips the API key header — fail loudly.
      redirect: "manual",
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 400));
      return npFetch(path, init, attempt + 1);
    }
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      throw new NowPaymentsError(504, "nowpayments_timeout", "Crypto payment service timed out");
    }
    throw err;
  }
}

/** Simple availability probe (`{"message":"OK"}`). */
export async function nowPaymentsApiStatus(): Promise<boolean> {
  try {
    const res = await npFetch("/status", { method: "GET" });
    if (!res.ok) return false;
    const text = await res.text();
    return /ok/i.test(text);
  } catch {
    return false;
  }
}

export interface CreateNowPaymentsInvoiceInput {
  /** Authoritative order total in MINOR units (pence). */
  amountMinor: number;
  currency: "GBP";
  orderId: string;
  orderDescription: string;
  successUrl: string;
  cancelUrl: string;
  partiallyPaidUrl?: string;
  ipnCallbackUrl: string;
}

export interface NowPaymentsInvoice {
  id: string;
  invoiceUrl: string;
  createdAt: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
}

/**
 * Create a hosted invoice. The caller MUST pass a server-derived amount —
 * never a client-supplied total.
 */
export async function createNowPaymentsInvoice(
  input: CreateNowPaymentsInvoiceInput,
): Promise<NowPaymentsInvoice> {
  const { apiKey, payoutCurrency, payCurrency } = readNowPaymentsCredentials();
  if (!apiKey) {
    throw new NowPaymentsError(
      500,
      "missing_credentials",
      "Crypto payments are not configured. Please use Pay by Bank.",
    );
  }

  const amountMinor = Math.round(input.amountMinor);
  if (!Number.isFinite(amountMinor) || amountMinor < 100 || amountMinor > 10_000_000) {
    throw new NowPaymentsError(
      400,
      "amount_out_of_range",
      "Order total is out of range for crypto payment.",
    );
  }

  const body: Record<string, unknown> = {
    price_amount: Math.round(amountMinor) / 100,
    price_currency: input.currency.toLowerCase(),
    order_id: input.orderId,
    order_description: input.orderDescription.slice(0, 250),
    ipn_callback_url: input.ipnCallbackUrl,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    is_fee_paid_by_user: true,
  };
  if (input.partiallyPaidUrl) body.partially_paid_url = input.partiallyPaidUrl;
  if (payoutCurrency) body.payout_currency = payoutCurrency;
  // Open the hosted invoice on a coin we know is live (USDT TRC20 by default).
  // Without this the page picks its own default — recently USDC, which renders
  // "This currency is currently unavailable. Try it in 2 hours". Only pin it
  // when the order total clears that coin's network minimum; below it the coin
  // really is unpayable and the shopper needs the full picker.
  if (payCurrency) {
    const minGbp = await payCurrencyMinGbp(payCurrency);
    if (minGbp == null || amountMinor / 100 >= minGbp) {
      body.pay_currency = payCurrency;
    }
  }


  const res = await npFetch("/invoice", { method: "POST", body: JSON.stringify(body) });
  const text = await res.text();

  if (res.status >= 300 && res.status < 400) {
    throw new NowPaymentsError(res.status, "unexpected_redirect", "Crypto payment service unavailable");
  }
  if (!res.ok) {
    console.error(`[NOWPayments] invoice failed ${res.status}: ${text.slice(0, 300)}`);
    const authProblem = res.status === 401 || res.status === 403;
    throw new NowPaymentsError(
      res.status,
      text,
      authProblem
        ? "Crypto payments are not active yet — please use Pay by Bank."
        : res.status === 400
          ? "Crypto payment could not be started for this order."
          : "Crypto payment service unavailable — please try Pay by Bank.",
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new NowPaymentsError(502, "invalid_json", "Crypto payment service returned an unexpected response");
  }

  const id = String(parsed.id ?? "");
  const invoiceUrl = typeof parsed.invoice_url === "string" ? parsed.invoice_url : "";
  if (!id || !invoiceUrl.startsWith("https://")) {
    throw new NowPaymentsError(502, text, "Crypto payment service returned an unexpected response");
  }

  return {
    id,
    invoiceUrl,
    createdAt: typeof parsed.created_at === "string" ? parsed.created_at : null,
    priceAmount: parsed.price_amount != null ? String(parsed.price_amount) : null,
    priceCurrency: typeof parsed.price_currency === "string" ? parsed.price_currency : null,
  };
}

export interface NowPaymentsPaymentStatus {
  paymentId: string;
  status: string;
  orderId: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  actuallyPaid: number | null;
  payCurrency: string | null;
  outcomeAmount: number | null;
  outcomeCurrency: string | null;
}

/** IPN fallback — poll one payment. */
export async function getNowPaymentsPayment(paymentId: string): Promise<NowPaymentsPaymentStatus> {
  if (!/^[0-9]{4,24}$/.test(paymentId)) {
    throw new NowPaymentsError(400, "bad_payment_id", "Invalid crypto payment reference");
  }
  const res = await npFetch(`/payment/${encodeURIComponent(paymentId)}`, { method: "GET" });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[NOWPayments] payment lookup failed ${res.status}: ${text.slice(0, 200)}`);
    throw new NowPaymentsError(res.status, text, "Could not check crypto payment status");
  }
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new NowPaymentsError(502, "invalid_json", "Could not check crypto payment status");
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    paymentId: String(p.payment_id ?? paymentId),
    status: String(p.payment_status ?? "unknown"),
    orderId: typeof p.order_id === "string" ? p.order_id : null,
    priceAmount: num(p.price_amount),
    priceCurrency: typeof p.price_currency === "string" ? p.price_currency : null,
    actuallyPaid: num(p.actually_paid),
    payCurrency: typeof p.pay_currency === "string" ? p.pay_currency : null,
    outcomeAmount: num(p.outcome_amount),
    outcomeCurrency: typeof p.outcome_currency === "string" ? p.outcome_currency : null,
  };
}

/**
 * NOWPayments signs the IPN body as
 *   HMAC_SHA512(ipn_secret, JSON.stringify(body with keys sorted A→Z))
 * delivered in the `x-nowpayments-sig` header.
 *
 * The sorting is recursive over nested objects. Arrays keep their order.
 * Exported for the unit test.
 */
export function sortedJsonStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortDeep(src[key]);
    return out;
  }
  return value;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a NOWPayments IPN callback.
 *
 * `rawBody` must be the untouched request body string — we parse it here only
 * to re-serialise with sorted keys, which is exactly what NOWPayments signs.
 * Comparison is constant time. Returns false on any problem.
 */
export async function verifyNowPaymentsSignature(
  rawBody: string,
  signature: string | null | undefined,
  opts?: { secret?: string | null },
): Promise<boolean> {
  const secret = opts?.secret ?? readNowPaymentsCredentials().ipnSecret;
  if (!secret || !signature) return false;
  const provided = signature.trim().toLowerCase();
  if (!/^[a-f0-9]{128}$/.test(provided)) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(sortedJsonStringify(parsed)));
  return timingSafeEqualStr(provided, toHex(mac));
}

/** Map a NOWPayments payment_status to our order lifecycle. */
export function mapNowPaymentsStatus(
  raw: string,
): "paid" | "failed" | "expired" | "partial" | null {
  const s = String(raw || "").toLowerCase();
  if (s === "finished" || s === "confirmed") return "paid";
  if (s === "failed" || s === "refunded") return "failed";
  if (s === "expired") return "expired";
  if (s === "partially_paid") return "partial";
  // waiting / confirming / sending — informational only.
  return null;
}

/**
 * NOWPayments adapter — crypto payments via the NOWPayments Open API.
 *
 * Base URLs:
 *   live:    https://api.nowpayments.io/v1
 *   sandbox: https://api-sandbox.nowpayments.io/v1
 *
 * Two integration flows, selectable in Admin → Payment Gateways:
 *  - "invoice": NOWPayments hosts the checkout page (POST /v1/invoice). The
 *    customer picks the coin on their page; we redirect to `invoice_url`.
 *  - "payment": we create a deposit-address payment (POST /v1/payment) and
 *    render address/QR on our own page. `pay_currency` comes from
 *    NOWPAYMENTS_PAY_CURRENCY (default "usdttrc20").
 *
 * Secrets (Cloudflare Worker env — NEVER in the repo or the browser):
 *   NOWPAYMENTS_API_KEY      — sent as the `x-api-key` header
 *   NOWPAYMENTS_IPN_SECRET   — HMAC-SHA512 key verifying `x-nowpayments-sig`
 *   NOWPAYMENTS_ENV          — "sandbox" switches the default base URL
 *   NOWPAYMENTS_PAY_CURRENCY — coin for the "payment" flow (optional)
 *
 * Server-only. NEVER import from client code.
 */

const LIVE_BASE_URL = "https://api.nowpayments.io/v1";
const SANDBOX_BASE_URL = "https://api-sandbox.nowpayments.io/v1";
const DEFAULT_PAY_CURRENCY = "usdttrc20";
const REQUEST_TIMEOUT_MS = 15_000;

export class NowpaymentsError extends Error {
  readonly status: number;
  readonly userMessage: string;
  constructor(message: string, status = 502, userMessage?: string) {
    super(message);
    this.name = "NowpaymentsError";
    this.status = status;
    this.userMessage = userMessage ?? "Crypto payment service unavailable";
  }
}

export function nowpaymentsBaseUrl(sandbox: boolean): string {
  return sandbox ? SANDBOX_BASE_URL : LIVE_BASE_URL;
}

export function nowpaymentsDefaultSandbox(): boolean {
  return String(process.env.NOWPAYMENTS_ENV ?? "").toLowerCase() === "sandbox";
}

function apiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY?.trim();
  if (!key) {
    throw new NowpaymentsError("NOWPAYMENTS_API_KEY is not configured", 503);
  }
  return key;
}

/** Coin used for the direct "payment" (deposit-address) flow. */
export function nowpaymentsPayCurrency(): string {
  return (process.env.NOWPAYMENTS_PAY_CURRENCY ?? DEFAULT_PAY_CURRENCY)
    .trim()
    .toLowerCase();
}

async function nowpaymentsFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; sandbox?: boolean } = {},
): Promise<T> {
  const url = `${nowpaymentsBaseUrl(init.sandbox ?? nowpaymentsDefaultSandbox())}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "x-api-key": apiKey(),
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new NowpaymentsError(
      `NOWPayments request failed: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new NowpaymentsError(
      `NOWPayments ${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NowpaymentsError(`NOWPayments ${path} returned non-JSON`, 502);
  }
}

export interface NowpaymentsInvoiceResult {
  id: string;
  invoice_url: string;
  order_id?: string;
  price_amount?: number;
  price_currency?: string;
}

/** POST /v1/invoice — hosted checkout page; customer picks the coin there. */
export async function nowpaymentsCreateInvoice(args: {
  priceAmount: number;
  priceCurrency: string;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
  sandbox: boolean;
}): Promise<NowpaymentsInvoiceResult> {
  const res = await nowpaymentsFetch<Record<string, unknown>>("/invoice", {
    method: "POST",
    sandbox: args.sandbox,
    body: {
      price_amount: args.priceAmount,
      price_currency: args.priceCurrency,
      order_id: args.orderId,
      order_description: args.orderDescription,
      ipn_callback_url: args.ipnCallbackUrl,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    },
  });
  const id = String(res.id ?? "");
  const invoiceUrl = String(res.invoice_url ?? "");
  if (!id || !invoiceUrl) {
    throw new NowpaymentsError("NOWPayments invoice response missing id/invoice_url", 502);
  }
  return {
    id,
    invoice_url: invoiceUrl,
    order_id: typeof res.order_id === "string" ? res.order_id : undefined,
    price_amount: typeof res.price_amount === "number" ? res.price_amount : undefined,
    price_currency: typeof res.price_currency === "string" ? res.price_currency : undefined,
  };
}

export interface NowpaymentsPaymentResult {
  payment_id: string;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount?: number;
  price_currency?: string;
}

/** POST /v1/payment — direct deposit-address payment in a fixed coin. */
export async function nowpaymentsCreatePayment(args: {
  priceAmount: number;
  priceCurrency: string;
  payCurrency?: string;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
  sandbox: boolean;
}): Promise<NowpaymentsPaymentResult> {
  const res = await nowpaymentsFetch<Record<string, unknown>>("/payment", {
    method: "POST",
    sandbox: args.sandbox,
    body: {
      price_amount: args.priceAmount,
      price_currency: args.priceCurrency,
      pay_currency: (args.payCurrency ?? nowpaymentsPayCurrency()).toLowerCase(),
      order_id: args.orderId,
      order_description: args.orderDescription,
      ipn_callback_url: args.ipnCallbackUrl,
    },
  });
  const paymentId = String(res.payment_id ?? "");
  const payAddress = String(res.pay_address ?? "");
  if (!paymentId || !payAddress) {
    throw new NowpaymentsError("NOWPayments payment response missing payment_id/pay_address", 502);
  }
  return {
    payment_id: paymentId,
    payment_status: String(res.payment_status ?? "waiting"),
    pay_address: payAddress,
    pay_amount: Number(res.pay_amount ?? 0),
    pay_currency: String(res.pay_currency ?? ""),
    price_amount: typeof res.price_amount === "number" ? res.price_amount : undefined,
    price_currency: typeof res.price_currency === "string" ? res.price_currency : undefined,
  };
}

export interface NowpaymentsPaymentStatus {
  payment_id: string;
  payment_status: string;
  pay_address?: string;
  price_amount?: number;
  price_currency?: string;
  pay_amount?: number;
  pay_currency?: string;
  actually_paid?: number;
  order_id?: string;
  outcome_amount?: number;
  outcome_currency?: string;
}

/** GET /v1/payment/{id} — authoritative status re-fetch for the IPN handler. */
export async function nowpaymentsGetPayment(
  paymentId: string,
  sandbox: boolean,
): Promise<NowpaymentsPaymentStatus> {
  const res = await nowpaymentsFetch<Record<string, unknown>>(
    `/payment/${encodeURIComponent(paymentId)}`,
    { sandbox },
  );
  return {
    payment_id: String(res.payment_id ?? paymentId),
    payment_status: String(res.payment_status ?? ""),
    pay_address: typeof res.pay_address === "string" ? res.pay_address : undefined,
    price_amount: typeof res.price_amount === "number" ? res.price_amount : undefined,
    price_currency: typeof res.price_currency === "string" ? res.price_currency : undefined,
    pay_amount: typeof res.pay_amount === "number" ? res.pay_amount : undefined,
    pay_currency: typeof res.pay_currency === "string" ? res.pay_currency : undefined,
    actually_paid: typeof res.actually_paid === "number" ? res.actually_paid : undefined,
    order_id: typeof res.order_id === "string" ? res.order_id : undefined,
    outcome_amount: typeof res.outcome_amount === "number" ? res.outcome_amount : undefined,
    outcome_currency:
      typeof res.outcome_currency === "string" ? res.outcome_currency : undefined,
  };
}

/**
 * Admin "Test" button: GET /v1/status (liveness) + GET /v1/merchant/coins
 * (proves the API key is accepted and returns the enabled payout coins).
 */
export async function nowpaymentsTestConnection(
  sandbox: boolean,
): Promise<{ statusMessage: string; currenciesCount: number }> {
  const status = await nowpaymentsFetch<Record<string, unknown>>("/status", { sandbox });
  const coins = await nowpaymentsFetch<unknown>("/merchant/coins", { sandbox });
  return {
    statusMessage: String(status.message ?? "OK"),
    currenciesCount: Array.isArray(coins) ? coins.length : 0,
  };
}

// ---------- IPN signature ----------

/**
 * Recursively sort all object keys (arrays keep order). NOWPayments signs the
 * canonical `JSON.stringify` of the sorted payload — this is NOT the raw body
 * bytes, unlike the Fena/Wallid schemes.
 */
export function sortNowpaymentsPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortNowpaymentsPayload);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      out[key] = sortNowpaymentsPayload(src[key]);
    }
    return out;
  }
  return value;
}

async function hmacSha512Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify `x-nowpayments-sig` for an IPN payload.
 * @param payload  The PARSED JSON body (it is re-serialised with sorted keys).
 * @param header   The `x-nowpayments-sig` header value (128 hex chars).
 * @param secret   NOWPAYMENTS_IPN_SECRET.
 */
export async function verifyNowpaymentsIpn(
  payload: unknown,
  header: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!header || !secret || payload === null || typeof payload !== "object") return false;
  const provided = header.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(provided)) return false;
  const canonical = JSON.stringify(sortNowpaymentsPayload(payload));
  const expected = await hmacSha512Hex(canonical, secret);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

// ---------- status mapping ----------

export interface NowpaymentsStatusUpdate {
  /** New order status, or null when the order status must not change. */
  orderStatus: "paid" | "failed" | "expired" | "refunded" | null;
  /** Raw NOWPayments status (lowercased) — always recorded on the order. */
  nowpaymentsStatus: string;
  isPaid: boolean;
  isTerminal: boolean;
}

/**
 * Map NOWPayments payment statuses onto order statuses.
 *   finished        → paid       (funds received, payout in progress/done)
 *   failed          → failed
 *   expired         → expired    (customer never paid in time)
 *   refunded        → refunded
 *   waiting / confirming / confirmed / sending / partially_paid
 *                   → no order-status change (still in flight)
 */
export function mapNowpaymentsStatus(raw: string): NowpaymentsStatusUpdate {
  const s = String(raw ?? "").toLowerCase();
  switch (s) {
    case "finished":
      return { orderStatus: "paid", nowpaymentsStatus: s, isPaid: true, isTerminal: true };
    case "failed":
      return { orderStatus: "failed", nowpaymentsStatus: s, isPaid: false, isTerminal: true };
    case "expired":
      return { orderStatus: "expired", nowpaymentsStatus: s, isPaid: false, isTerminal: true };
    case "refunded":
      return { orderStatus: "refunded", nowpaymentsStatus: s, isPaid: false, isTerminal: true };
    default:
      // waiting, confirming, confirmed, sending, partially_paid, unknown
      return { orderStatus: null, nowpaymentsStatus: s, isPaid: false, isTerminal: false };
  }
}

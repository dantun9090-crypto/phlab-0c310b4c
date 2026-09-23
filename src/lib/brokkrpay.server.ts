/**
 * BrokkrPay payment-link server helper.
 *
 * SERVER ONLY (`.server.ts` is blocked from client bundles).
 *
 * Money model — read this before touching amounts:
 *   BrokkrPay charges WHOLE currency units and USD only. `amount: 180`
 *   charges $180.00. Sending 18000 for a $180 order charges $18,000.
 *   Our store prices in GBP pence, so every call converts pence → whole USD
 *   with `gbpPenceToUsdWhole()` (rounds UP, never down).
 *
 * Fulfilment is driven ONLY by the signed `order.state_changed` webhook with
 * `state: "SUCCESS"` (or an explicit order lookup showing SUCCESS) — never by
 * the customer returning to the site.
 *
 * Env (read inside functions — Workers inject per request):
 *   BROKKRPAY_API_KEY         bpk_test_… / bpk_live_… (key picks the environment)
 *   BROKKRPAY_WEBHOOK_SECRET  whsec_… fallback when no secret is stored in Firestore
 */
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";
import { gbpPenceToUsdWhole } from "@/lib/brokkrpay-amount";

const BROKKRPAY_BASE = "https://api.brokkrpay.com";
const TIMEOUT_MS = 12_000;
/** Replay window for webhook timestamps, in seconds. */
export const BROKKRPAY_SIGNATURE_TOLERANCE_SEC = 300;
/** Firestore doc holding the signing secret returned by the webhook registration. */
export const BROKKRPAY_SECRET_DOC = { collection: "payment_secrets", id: "brokkrpay" } as const;

export type BrokkrPayState = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED" | "FROZEN";

export class BrokkrPayError extends Error {
  status: number;
  body: string;
  userMessage: string;
  constructor(status: number, body: string, userMessage: string) {
    super(`BrokkrPay ${status}: ${body.slice(0, 200)}`);
    this.name = "BrokkrPayError";
    this.status = status;
    this.body = body;
    this.userMessage = userMessage;
  }
}

export function readBrokkrPayApiKey(): string | null {
  // A live key, when present, always wins over the sandbox key.
  const live = process.env["BROKKRPAY_LIVE_API_KEY"];
  if (live && /^bpk_live_/.test(live)) return live;
  return process.env["BROKKRPAY_API_KEY"] || null;
}

export function isBrokkrPayConfigured(): boolean {
  return /^bpk_(test|live)_/.test(readBrokkrPayApiKey() ?? "");
}

/** test / live is decided by the key prefix, never by our own config. */
export function brokkrPayMode(): "test" | "live" | "unknown" {
  const key = readBrokkrPayApiKey() ?? "";
  if (key.startsWith("bpk_live_")) return "live";
  if (key.startsWith("bpk_test_")) return "test";
  return "unknown";
}

/** `bpk_live_…abcd` → `bpk_live_…abcd` masked for admin display. */
export function maskBrokkrPayKey(): string | null {
  const key = readBrokkrPayApiKey();
  if (!key) return null;
  const tail = key.slice(-4);
  const prefix = key.startsWith("bpk_live_") ? "bpk_live_" : key.startsWith("bpk_test_") ? "bpk_test_" : "bpk_";
  return `${prefix}…${tail}`;
}

/**
 * The signing secret for the current environment. Preference order:
 *   1. Firestore `payment_secrets/brokkrpay` (written by the one-click webhook
 *      registration, keyed per mode — no human copy/paste step).
 *   2. `BROKKRPAY_WEBHOOK_SECRET` env fallback.
 */
export async function readBrokkrPayWebhookSecret(): Promise<string | null> {
  const mode = brokkrPayMode();
  try {
    const { getDocAdmin } = await import("@/lib/server/firestore-admin");
    const doc = await getDocAdmin(BROKKRPAY_SECRET_DOC.collection, BROKKRPAY_SECRET_DOC.id);
    const stored = doc?.[mode === "live" ? "liveWebhookSecret" : "testWebhookSecret"];
    if (typeof stored === "string" && stored.length >= 16) return stored;
  } catch (err) {
    console.warn(
      "[BrokkrPay] stored webhook secret unavailable:",
      err instanceof Error ? err.message : err,
    );
  }
  return process.env["BROKKRPAY_WEBHOOK_SECRET"] || null;
}

async function brokkrFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
  attempt = 0,
): Promise<Response> {
  const apiKey = readBrokkrPayApiKey();
  if (!apiKey) {
    throw new BrokkrPayError(
      500,
      "missing_credentials",
      "Card payments are not configured. Please use Pay by Bank.",
    );
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey.slice(0, 200);

  try {
    return await fetch(`${BROKKRPAY_BASE}${path}`, {
      ...init,
      headers,
      // A cross-origin redirect strips Authorization and surfaces as a silent
      // 401 — fail loudly instead of following it.
      redirect: "manual",
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    // Only retry reads / idempotent writes. A create without a replayed key
    // could otherwise produce two orders.
    const retryable = init.method === undefined || init.method === "GET" || Boolean(init.idempotencyKey);
    if (attempt < 1 && retryable) {
      await new Promise((r) => setTimeout(r, 400));
      return brokkrFetch(path, init, attempt + 1);
    }
    if (isTimeout) throw new BrokkrPayError(504, "brokkrpay_timeout", "Payment service timed out");
    throw err;
  }
}

async function readJson(res: Response, context: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (res.status >= 300 && res.status < 400) {
    throw new BrokkrPayError(res.status, "unexpected_redirect", "Payment service unavailable");
  }
  if (!res.ok) {
    console.error(`[BrokkrPay] ${context} failed ${res.status}: ${text.slice(0, 300)}`);
    let code = "";
    try {
      code = String((JSON.parse(text) as Record<string, unknown>).error ?? "");
    } catch {
      code = "";
    }
    throw new BrokkrPayError(
      res.status,
      text,
      res.status === 401
        ? "Card payments are not configured correctly."
        : res.status === 400
          ? code || "Card payment could not be started for this order."
          : "Card payment service unavailable — please try Pay by Bank.",
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new BrokkrPayError(502, "invalid_json", "Payment service returned an unexpected response");
  }
}

// ---------- Payment links ----------

export interface CreateBrokkrPayLinkInput {
  /** Authoritative order total in GBP pence, straight from the database. */
  amountPence: number;
  /** GBP→USD rate set by the admin. */
  usdRate: number;
  /** Our own order id — echoed back in every webhook. */
  reference: string;
  returnUrl: string;
  customerEmail?: string | null;
  delivery?: "direct" | "email";
  /** Retry-safe key; same key returns the original order (`replayed: true`). */
  idempotencyKey?: string;
}

export interface BrokkrPayLink {
  orderId: string;
  state: BrokkrPayState;
  mode: "test" | "live";
  amountUsd: number;
  currency: string;
  delivery: "direct" | "email";
  checkoutUrl: string | null;
  customerEmailSent: boolean | null;
  expiresAt: string | null;
  replayed: boolean;
}

export async function createBrokkrPayLink(input: CreateBrokkrPayLinkInput): Promise<BrokkrPayLink> {
  // Charge in GBP (store currency). BrokkrPay still takes WHOLE units only,
  // so pence are rounded UP to the next pound — never under-charge.
  void gbpPenceToUsdWhole;
  const amountUsd = Math.max(1, Math.ceil(Math.round(Number(input.amountPence)) / 100));
  if (!Number.isInteger(amountUsd) || amountUsd < 1 || amountUsd > 100_000) {
    throw new BrokkrPayError(400, "amount_out_of_range", "Order total is out of range for card payment.");
  }
  const delivery = input.delivery ?? "direct";
  if (delivery === "email" && !input.customerEmail) {
    throw new BrokkrPayError(400, "email_required", "An email address is required for this payment method.");
  }

  const body: Record<string, unknown> = {
    amount: amountUsd,
    currency: "GBP",
    delivery,
    reference: input.reference.slice(0, 200),
    returnUrl: input.returnUrl.slice(0, 2000),
  };
  if (input.customerEmail) body.customerEmail = input.customerEmail.slice(0, 320);

  const res = await brokkrFetch("/api/payment-links", {
    method: "POST",
    body: JSON.stringify(body),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  const parsed = await readJson(res, "payment-links");

  const orderId = typeof parsed.orderId === "string" ? parsed.orderId : "";
  if (!orderId) {
    throw new BrokkrPayError(502, JSON.stringify(parsed), "Payment service returned an unexpected response");
  }
  const checkoutUrl = typeof parsed.checkoutUrl === "string" ? parsed.checkoutUrl : null;
  if (delivery === "direct" && !checkoutUrl?.startsWith("https://")) {
    throw new BrokkrPayError(502, JSON.stringify(parsed), "Payment service returned an unexpected response");
  }

  return {
    orderId,
    state: (typeof parsed.state === "string" ? parsed.state : "PENDING") as BrokkrPayState,
    mode: parsed.mode === "live" ? "live" : "test",
    amountUsd: typeof parsed.amount === "number" ? parsed.amount : amountUsd,
    currency: typeof parsed.currency === "string" ? parsed.currency : "GBP",
    delivery,
    checkoutUrl,
    customerEmailSent: typeof parsed.customerEmailSent === "boolean" ? parsed.customerEmailSent : null,
    expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : null,
    replayed: parsed.replayed === true,
  };
}

export interface BrokkrPayOrder {
  orderId: string;
  state: BrokkrPayState;
  amount: number;
  currency: string;
  clientReference: string | null;
  paymentMethod: string | null;
  statusDetail: string | null;
  sessionExpiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lineItems: Array<{ name: string; unitAmount: number; quantity: number }>;
}

function toOrder(parsed: Record<string, unknown>): BrokkrPayOrder {
  return {
    orderId: String(parsed.orderId ?? ""),
    state: (typeof parsed.state === "string" ? parsed.state : "PENDING") as BrokkrPayState,
    amount: typeof parsed.amount === "number" ? parsed.amount : 0,
    currency: typeof parsed.currency === "string" ? parsed.currency : "USD",
    clientReference: typeof parsed.clientReference === "string" ? parsed.clientReference : null,
    paymentMethod: typeof parsed.paymentMethod === "string" ? parsed.paymentMethod : null,
    statusDetail: typeof parsed.statusDetail === "string" ? parsed.statusDetail : null,
    sessionExpiresAt: typeof parsed.sessionExpiresAt === "string" ? parsed.sessionExpiresAt : null,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : null,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    lineItems: Array.isArray(parsed.lineItems)
      ? (parsed.lineItems as Array<Record<string, unknown>>).map((li) => ({
          name: String(li.name ?? ""),
          unitAmount: Number(li.unitAmount ?? 0),
          quantity: Number(li.quantity ?? 0),
        }))
      : [],
  };
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export async function getBrokkrPayOrder(orderId: string): Promise<BrokkrPayOrder | null> {
  if (!UUID_RE.test(orderId)) {
    throw new BrokkrPayError(400, "bad_order_id", "Invalid payment reference");
  }
  const res = await brokkrFetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
  if (res.status === 404) return null;
  return toOrder(await readJson(res, "orders/{id}"));
}

export async function findBrokkrPayOrdersByReference(reference: string): Promise<BrokkrPayOrder[]> {
  const res = await brokkrFetch(`/api/orders?reference=${encodeURIComponent(reference.slice(0, 200))}`, {
    method: "GET",
  });
  const parsed = await readJson(res, "orders?reference");
  const rows = Array.isArray(parsed.orders) ? (parsed.orders as Array<Record<string, unknown>>) : [];
  return rows.map(toOrder);
}

export async function resendBrokkrPayEmail(
  orderId: string,
  customerEmail?: string | null,
): Promise<{ ok: boolean; message: string }> {
  if (!UUID_RE.test(orderId)) {
    throw new BrokkrPayError(400, "bad_order_id", "Invalid payment reference");
  }
  const res = await brokkrFetch(`/api/payment-links/${encodeURIComponent(orderId)}/resend`, {
    method: "POST",
    body: JSON.stringify(customerEmail ? { customerEmail } : {}),
  });
  if (res.status === 409) {
    const text = await res.text();
    let msg = "This order no longer has a payable link — create a new one.";
    try {
      msg = String((JSON.parse(text) as Record<string, unknown>).error ?? msg);
    } catch {
      /* keep default */
    }
    return { ok: false, message: msg };
  }
  await readJson(res, "resend");
  return { ok: true, message: "Payment link email re-sent." };
}

export async function cancelBrokkrPayOrder(orderId: string): Promise<{ orderId: string; state: BrokkrPayState }> {
  if (!UUID_RE.test(orderId)) {
    throw new BrokkrPayError(400, "bad_order_id", "Invalid payment reference");
  }
  const res = await brokkrFetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST" });
  const parsed = await readJson(res, "cancel");
  return {
    orderId: String(parsed.orderId ?? orderId),
    state: (typeof parsed.state === "string" ? parsed.state : "CANCELLED") as BrokkrPayState,
  };
}

// ---------- Site / amounts / webhook registration ----------

export interface BrokkrPaySite {
  storeId: string;
  name: string;
  url: string | null;
  mode: "test" | "live";
  currency: string;
  liveEnabled: boolean;
  checkoutReady: boolean;
  checkoutBlockedReason: string | null;
  chargesTo: "client" | "brokkrpay";
  webhookUrl: string | null;
  portalUrl: string | null;
}

export async function getBrokkrPaySite(): Promise<BrokkrPaySite> {
  const res = await brokkrFetch("/api/site", { method: "GET" });
  const parsed = await readJson(res, "site");
  return {
    storeId: String(parsed.storeId ?? ""),
    name: String(parsed.name ?? ""),
    url: typeof parsed.url === "string" ? parsed.url : null,
    mode: parsed.mode === "live" ? "live" : "test",
    currency: String(parsed.currency ?? "USD"),
    liveEnabled: parsed.liveEnabled === true,
    checkoutReady: parsed.checkoutReady === true,
    checkoutBlockedReason:
      typeof parsed.checkoutBlockedReason === "string" ? parsed.checkoutBlockedReason : null,
    chargesTo: parsed.chargesTo === "client" ? "client" : "brokkrpay",
    webhookUrl: typeof parsed.webhookUrl === "string" ? parsed.webhookUrl : null,
    portalUrl: typeof parsed.portalUrl === "string" ? parsed.portalUrl : null,
  };
}

export interface BrokkrPayAmountCheck {
  amount: number | null;
  currency: string;
  mode: "test" | "live";
  payable: boolean | null;
  reason: string | null;
  allAmountsPayable: boolean | null;
  pricePoints: number[];
  lineItems: Array<{ name: string; unitAmount: number; quantity: number }>;
}

export async function checkBrokkrPayAmount(amountUsd?: number): Promise<BrokkrPayAmountCheck> {
  const qs = amountUsd && Number.isInteger(amountUsd) ? `?amount=${amountUsd}&currency=USD` : "?currency=USD";
  const res = await brokkrFetch(`/api/amounts${qs}`, { method: "GET" });
  const parsed = await readJson(res, "amounts");
  return {
    amount: typeof parsed.amount === "number" ? parsed.amount : null,
    currency: String(parsed.currency ?? "USD"),
    mode: parsed.mode === "live" ? "live" : "test",
    payable: typeof parsed.payable === "boolean" ? parsed.payable : null,
    reason: typeof parsed.reason === "string" ? parsed.reason : null,
    allAmountsPayable: typeof parsed.allAmountsPayable === "boolean" ? parsed.allAmountsPayable : null,
    pricePoints: Array.isArray(parsed.pricePoints) ? (parsed.pricePoints as number[]) : [],
    lineItems: Array.isArray(parsed.lineItems)
      ? (parsed.lineItems as Array<Record<string, unknown>>).map((li) => ({
          name: String(li.name ?? ""),
          unitAmount: Number(li.unitAmount ?? 0),
          quantity: Number(li.quantity ?? 0),
        }))
      : [],
  };
}

/**
 * Register our webhook endpoint for the current environment and persist the
 * returned signing secret server-side, so no human ever copies it around.
 */
export async function registerBrokkrPayWebhook(
  url: string | null,
): Promise<{ mode: "test" | "live"; webhookUrl: string | null; secretStored: boolean }> {
  const res = await brokkrFetch("/api/site/webhook", {
    method: "PUT",
    body: JSON.stringify({ url }),
  });
  const parsed = await readJson(res, "site/webhook");
  const mode = parsed.mode === "live" ? "live" : "test";
  const webhookUrl = typeof parsed.webhookUrl === "string" ? parsed.webhookUrl : null;
  const secret = typeof parsed.webhookSecret === "string" ? parsed.webhookSecret : "";

  let secretStored = false;
  if (secret.length >= 16) {
    const { addDocAdmin, updateDocAdmin } = await import("@/lib/server/firestore-admin");
    const field = mode === "live" ? "liveWebhookSecret" : "testWebhookSecret";
    const payload = { [field]: secret, [`${field}UpdatedAt`]: new Date(), webhookUrl };
    try {
      await updateDocAdmin(BROKKRPAY_SECRET_DOC.collection, BROKKRPAY_SECRET_DOC.id, payload);
    } catch {
      await addDocAdmin(BROKKRPAY_SECRET_DOC.collection, payload, BROKKRPAY_SECRET_DOC.id);
    }
    secretStored = true;
  }
  return { mode, webhookUrl, secretStored };
}

// ---------- Webhook signature ----------

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parse `t=<unix seconds>,v1=<hex>` (order-insensitive). */
export function parseBrokkrSignatureHeader(header: string): { t: number; v1: string } | null {
  if (typeof header !== "string" || header.length === 0 || header.length > 512) return null;
  let t: number | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key === "t") {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) t = Math.floor(n);
    } else if (key === "v1" && /^[a-fA-F0-9]{64}$/.test(val)) {
      v1 = val.toLowerCase();
    }
  }
  if (t === null || v1 === null) return null;
  return { t, v1 };
}

/**
 * Verify a `Brokkr-Signature` header against the RAW request body.
 *
 * `rawBody` MUST be the untouched request text — parsing to JSON and
 * re-serialising changes the bytes and every signature mismatches.
 */
export async function verifyBrokkrPaySignature(
  rawBody: string,
  signature: string | null | undefined,
  opts: { secret: string | null; nowSec?: number },
): Promise<boolean> {
  const secret = opts.secret;
  if (!secret || secret.length < 16) return false;
  if (!signature) return false;

  const parsed = parseBrokkrSignatureHeader(signature);
  if (!parsed) return false;

  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - parsed.t) > BROKKRPAY_SIGNATURE_TOLERANCE_SEC) return false;

  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(`${parsed.t}.${rawBody}`));
  return timingSafeEqualStr(parsed.v1, toHex(mac));
}

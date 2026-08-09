/**
 * PeptidePay (peptide-pay.com) hosted-checkout server helper.
 *
 * SERVER ONLY (`.server.ts` is blocked from client bundles).
 *
 * Only three PeptidePay endpoints exist and only these are used:
 *   1. POST {BASE}/checkout/init      — create a hosted checkout session
 *   2. GET  {BASE}/sessions/{id}      — poll session status (webhook fallback)
 *   3. POST → our /api/public/peptidepay-webhook (signed settlement notice)
 *
 * Money model: PeptidePay settles in USDC on Polygon straight to our wallet.
 * Card data is ONLY ever collected on PeptidePay's hosted checkout page — we
 * never render a card form and never proxy card details.
 *
 * Env (read inside functions, never at module scope — Workers inject per
 * request):
 *   PEPTIDEPAY_API_KEY        sk_live_… (advanced mode; identity is the header)
 *   PEPTIDEPAY_WALLET         0x… Polygon USDC address (wallet-only mode)
 *   PEPTIDEPAY_WEBHOOK_SECRET whsec_… (HMAC verification)
 */
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";

const PEPTIDEPAY_BASE = "https://pay.qistdigital.com/api/v1";
const TIMEOUT_MS = 10_000;
/** Replay window for webhook timestamps, in seconds. */
export const PEPTIDEPAY_SIGNATURE_TOLERANCE_SEC = 300;

export type PeptidePayCurrency = "GBP" | "EUR" | "USD" | "CAD" | "CHF" | "AUD";

export interface CreatePeptidePaySessionInput {
  /** Authoritative order total in minor units (pence for GBP). */
  amountCents: number;
  currency: PeptidePayCurrency;
  metadata?: Record<string, string>;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  productName?: string;
  webhookUrl?: string;
  /** Stable per-order key so retries never create a second session. */
  idempotencyKey?: string;
}

export interface PeptidePaySession {
  id: string;
  url: string;
  status: string;
  amount?: number;
  currency?: string;
  expiresAt?: string | null;
}

export class PeptidePayError extends Error {
  status: number;
  body: string;
  userMessage: string;
  constructor(status: number, body: string, userMessage: string) {
    super(`PeptidePay ${status}: ${body.slice(0, 200)}`);
    this.name = "PeptidePayError";
    this.status = status;
    this.body = body;
    this.userMessage = userMessage;
  }
}

export interface PeptidePayCredentials {
  apiKey: string | null;
  wallet: string | null;
  webhookSecret: string | null;
}

export function readPeptidePayCredentials(): PeptidePayCredentials {
  const apiKey = process.env["PEPTIDEPAY_API_KEY"] || null;
  const wallet = process.env["PEPTIDEPAY_WALLET"] || null;
  const webhookSecret = process.env["PEPTIDEPAY_WEBHOOK_SECRET"] || null;
  return { apiKey, wallet, webhookSecret };
}

/** True when we can create sessions at all (advanced OR wallet-only mode). */
export function isPeptidePayConfigured(): boolean {
  const { apiKey, wallet } = readPeptidePayCredentials();
  return Boolean(apiKey) || /^0x[a-fA-F0-9]{40}$/.test(wallet ?? "");
}

async function peptidePayFetch(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  try {
    return await fetch(`${PEPTIDEPAY_BASE}${path}`, {
      ...init,
      // Cross-origin redirects strip the Authorization header in fetch, which
      // shows up as a silent 401. Fail loudly instead of following.
      redirect: "manual",
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 400));
      return peptidePayFetch(path, init, attempt + 1);
    }
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      throw new PeptidePayError(504, "peptidepay_timeout", "Payment service timed out");
    }
    throw err;
  }
}

/**
 * Create a hosted checkout session. The caller MUST pass a server-derived
 * amount — never a client-supplied total.
 */
export async function createPeptidePaySession(
  input: CreatePeptidePaySessionInput,
): Promise<PeptidePaySession> {
  const { apiKey, wallet } = readPeptidePayCredentials();
  if (!apiKey && !wallet) {
    throw new PeptidePayError(
      500,
      "missing_credentials",
      "Card payments are not configured. Please use Pay by Bank.",
    );
  }

  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > 10_000_000) {
    throw new PeptidePayError(400, "amount_out_of_range", "Order total is out of range for card payment.");
  }

  const body: Record<string, unknown> = {
    amount_cents: amountCents,
    currency: input.currency,
  };
  // With Bearer auth the header IS the identity — sending `wallet` too is
  // ignored by the API, so only include it in wallet-only mode.
  if (!apiKey && wallet) body.wallet = wallet;
  if (input.customerEmail) body.customer_email = input.customerEmail;
  if (input.metadata && Object.keys(input.metadata).length > 0) body.metadata = input.metadata;
  if (input.successUrl) body.success_url = input.successUrl;
  if (input.cancelUrl) body.cancel_url = input.cancelUrl;
  if (input.productName) body.product_name = input.productName;
  if (input.webhookUrl) body.webhook_url = input.webhookUrl;

  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;

  const res = await peptidePayFetch("/checkout/init", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (res.status >= 300 && res.status < 400) {
    throw new PeptidePayError(res.status, "unexpected_redirect", "Payment service unavailable");
  }
  if (!res.ok) {
    // Never leak the provider's raw error verbatim, but map the known
    // account-state errors to something actionable for the shopper/admin.
    console.error(`[PeptidePay] checkout/init failed ${res.status}: ${text.slice(0, 300)}`);
    let code = "";
    try {
      code = String((JSON.parse(text) as Record<string, unknown>).error ?? "");
    } catch {
      code = "";
    }
    const accountNotLive =
      code === "merchant_pending" ||
      code === "merchant_disabled" ||
      /pending activation|not activated|account is disabled/i.test(text);
    throw new PeptidePayError(
      res.status,
      text,
      accountNotLive
        ? "Card payments are not active yet — please use Pay by Bank."
        : res.status === 400
          ? "Card payment could not be started for this order."
          : "Card payment service unavailable — please try Pay by Bank.",
    );
  }


  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new PeptidePayError(502, "invalid_json", "Payment service returned an unexpected response");
  }

  const id = typeof parsed.id === "string" ? parsed.id : "";
  const url = typeof parsed.url === "string" ? parsed.url : "";
  if (!id || !url.startsWith("https://")) {
    throw new PeptidePayError(502, text, "Payment service returned an unexpected response");
  }

  return {
    id,
    url,
    status: String(parsed.status ?? "pending"),
    amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
    currency: typeof parsed.currency === "string" ? parsed.currency : undefined,
    expiresAt: typeof parsed.expires_at === "string" ? parsed.expires_at : null,
  };
}

export interface PeptidePaySessionStatus {
  id: string;
  status: string;
  amount?: number;
  currency?: string;
  txid?: string | null;
  paidAt?: string | null;
}

/** Webhook fallback — poll a session's status. */
export async function getPeptidePaySessionStatus(sessionId: string): Promise<PeptidePaySessionStatus> {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(sessionId)) {
    throw new PeptidePayError(400, "bad_session_id", "Invalid payment session");
  }
  const { apiKey } = readPeptidePayCredentials();
  const res = await peptidePayFetch(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[PeptidePay] sessions lookup failed ${res.status}: ${text.slice(0, 200)}`);
    throw new PeptidePayError(res.status, text, "Could not check payment status");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new PeptidePayError(502, "invalid_json", "Could not check payment status");
  }
  return {
    id: String(parsed.id ?? sessionId),
    status: String(parsed.status ?? "unknown"),
    amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
    currency: typeof parsed.currency === "string" ? parsed.currency : undefined,
    txid: typeof parsed.txid === "string" ? parsed.txid : null,
    paidAt: typeof parsed.paid_at === "string" ? parsed.paid_at : null,
  };
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parse `t=<unix_seconds>,v1=<hex>` (Stripe-style, order-insensitive). */
export function parsePeptidePaySignatureHeader(header: string): { t: number; v1: string } | null {
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
    } else if (key === "v1") {
      if (/^[a-fA-F0-9]{64}$/.test(val)) v1 = val.toLowerCase();
    }
  }
  if (t === null || v1 === null) return null;
  return { t, v1 };
}

/**
 * Verify a PeptidePay webhook.
 *
 * `rawBody` MUST be the untouched request body string — parsing it to JSON
 * first and re-serialising changes the bytes and every signature mismatches.
 *
 * Returns false for: missing/short secret, malformed header, stale timestamp
 * (> 300s skew), or HMAC mismatch. Comparison is timing-safe.
 */
export async function verifyPeptidePaySignature(
  rawBody: string,
  signature: string | null | undefined,
  opts?: { nowSec?: number; secret?: string | null },
): Promise<boolean> {
  const secret = opts?.secret ?? readPeptidePayCredentials().webhookSecret;
  if (!secret) return false;
  if (!signature) return false;

  const parsed = parsePeptidePaySignatureHeader(signature);
  if (!parsed) return false;

  const nowSec = opts?.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - parsed.t) > PEPTIDEPAY_SIGNATURE_TOLERANCE_SEC) return false;

  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(`${parsed.t}.${rawBody}`));
  const expected = toHex(mac);

  return timingSafeEqualStr(parsed.v1, expected);
}

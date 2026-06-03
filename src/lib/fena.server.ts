/**
 * Server-only Fena Open Banking REST client.
 *
 * Docs: https://toolkit-docs.fena.co/toolkit-api/payments-module/single-payments/api-requests
 * Auth: `terminal-id` + `terminal-secret` headers (read from server env).
 *
 * NEVER import from client code.
 */
const FENA_BASE = "https://epos.api.prod-gcp.fena.co/open";

function authHeaders(): Record<string, string> {
  const id = process.env.FENA_TERMINAL_ID;
  const secret = process.env.FENA_TERMINAL_SECRET;
  if (!id || !secret) throw new Error("FENA credentials not configured");
  return {
    "terminal-id": id,
    "terminal-secret": secret,
    "content-type": "application/json",
  };
}

export interface FenaCreatedPayment {
  id: string;
  link: string; // HPP URL — redirect customer here
  status: string;
  reference: string;
  amount: string;
}

export interface FenaPaymentStatus {
  id: string;
  status: string; // draft | sent | paid | cancelled | expired | refunded ...
  reference: string;
  amount: string;
  completedAt?: string;
}

/**
 * Create a payment and immediately mark it as sent. Returns the HPP link
 * the customer must be redirected to.
 */
export async function fenaCreateAndProcess(input: {
  reference: string;
  amount: number; // GBP, e.g. 49.99
  customerName?: string;
  customerEmail?: string;
  description?: string;
  customRedirectUrl: string;
}): Promise<FenaCreatedPayment> {
  const body = {
    reference: input.reference,
    amount: input.amount.toFixed(2),
    paymentMethod: "fena_ob" as const,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    description: input.description,
    customRedirectUrl: input.customRedirectUrl,
    remitterAccountSelectionType: "any",
  };
  const res = await fetch(`${FENA_BASE}/payments/single/create-and-process`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fena create-and-process ${res.status}: ${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text) as { result?: FenaCreatedPayment };
  if (!parsed.result?.link || !parsed.result?.id) {
    throw new Error("Fena response missing result.link / result.id");
  }
  return parsed.result;
}

/**
 * Fetch authoritative payment state from Fena. Used by the webhook handler
 * to verify a status update before mutating the order.
 */
export async function fenaGetPayment(paymentId: string): Promise<FenaPaymentStatus> {
  const safe = encodeURIComponent(paymentId);
  const res = await fetch(`${FENA_BASE}/payments/single/${safe}`, {
    method: "GET",
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fena get-payment ${res.status}: ${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text) as { data?: FenaPaymentStatus };
  if (!parsed.data?.id) throw new Error("Fena response missing data.id");
  return parsed.data;
}

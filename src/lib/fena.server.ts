/**
 * Server-only Fena Open Banking REST client.
 *
 * Docs: https://toolkit-docs.fena.co/toolkit-api/payments-module/single-payments/api-requests
 * Auth: `terminal-id` + `terminal-secret` headers (read from server env).
 *
 * Environment (sandbox / production) is resolved at call time from:
 *   1. Firestore `settings/fena.env` (admin-controlled toggle), then
 *   2. `process.env.FENA_ENV` (secret fallback), then
 *   3. `"production"` default.
 *
 * Result is cached for 30 s so a single checkout flow doesn't pay for a
 * Firestore read per call, while admin toggles still propagate quickly.
 *
 * NEVER import from client code.
 */
import { getDocAdmin } from "@/lib/server/firestore-admin";

type FenaEnv = "sandbox" | "production";

let cached: { value: FenaEnv; expiresAt: number } | null = null;
const CACHE_MS = 30_000;

function envFromString(raw: unknown): FenaEnv {
  return String(raw ?? "").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

/**
 * Resolve the active Fena environment. Reads `settings/fena.env` first so
 * the admin toggle wins over the process-level secret. Failures fall back
 * silently to the secret/default so a missing settings doc never breaks
 * checkout.
 */
export async function getFenaEnvLabel(): Promise<FenaEnv> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  let value: FenaEnv = envFromString(process.env.FENA_ENV);
  try {
    const doc = await getDocAdmin("settings", "fena");
    if (doc && typeof doc.env === "string" && doc.env.trim()) {
      value = envFromString(doc.env);
    }
  } catch {
    // ignore — fall back to env / default
  }
  cached = { value, expiresAt: now + CACHE_MS };
  return value;
}

/** Force the next `getFenaEnvLabel()` call to re-read Firestore. */
export function invalidateFenaEnvCache(): void {
  cached = null;
}

async function getFenaBase(): Promise<string> {
  const env = await getFenaEnvLabel();
  return env === "sandbox"
    ? "https://epos.api.sandbox-gcp.fena.co/open"
    : "https://epos.api.prod-gcp.fena.co/open";
}

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
  status: string;
  reference: string;
  amount: string;
  completedAt?: string;
}

export async function fenaCreateAndProcess(input: {
  reference: string;
  amount: number;
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
  const base = await getFenaBase();
  const res = await fetch(`${base}/payments/single/create-and-process`, {
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

export async function fenaGetPayment(paymentId: string): Promise<FenaPaymentStatus> {
  const safe = encodeURIComponent(paymentId);
  const base = await getFenaBase();
  const res = await fetch(`${base}/payments/single/${safe}`, {
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

// ---------- Bank accounts module ----------

export interface FenaBankAccount {
  id: string;
  name?: string;
  status?: string;
  isDefault?: boolean;
  iban?: string;
  accountNumber?: string;
  sortCode?: string;
  bank?: string;
  currency?: string;
  createdAt?: string;
  [key: string]: unknown;
}

async function fenaJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = await getFenaBase();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fena ${init.method || "GET"} ${path} ${res.status}: ${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function fenaListBankAccounts(): Promise<FenaBankAccount[]> {
  const parsed = await fenaJson<{ data?: FenaBankAccount[]; result?: FenaBankAccount[] }>(
    "/company/bank-accounts/list",
  );
  return parsed.data ?? parsed.result ?? [];
}

export async function fenaGetBankAccount(id: string): Promise<FenaBankAccount> {
  const parsed = await fenaJson<{ data?: FenaBankAccount; result?: FenaBankAccount }>(
    `/company/bank-accounts/${encodeURIComponent(id)}`,
  );
  const acc = parsed.data ?? parsed.result;
  if (!acc?.id) throw new Error("Fena bank-account response missing id");
  return acc;
}

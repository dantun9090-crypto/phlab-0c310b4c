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
import { recordFenaApiCall } from "@/lib/fena-metrics.server";

/**
 * Single fetch helper that meters every Fena outbound call. Always
 * records (ok/error/status) — never re-throws metric failures.
 */
async function meteredFenaFetch(
  endpoint: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let res: Response | undefined;
  let status: number | undefined;
  try {
    res = await fetch(url, init);
    status = res.status;
    return res;
  } finally {
    // record after the call (or on throw with status undefined → error)
    void recordFenaApiCall({
      ok: res ? res.ok : false,
      status,
      endpoint,
    });
  }
}

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
  // Fena does not expose a separate sandbox API host — the "sandbox" mode is
  // selected at the HPP step by choosing a Sandbox bank (Natwest/RBS sandbox).
  // Both env labels therefore use the production GCP host; the toggle is kept
  // purely informational + for future-proofing if Fena ever splits hosts.
  await getFenaEnvLabel();
  return "https://epos.api.prod-gcp.fena.co/open";
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
  const res = await meteredFenaFetch(
    "POST /payments/single/create-and-process",
    `${base}/payments/single/create-and-process`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    },
  );
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
  const res = await meteredFenaFetch(
    `GET /payments/single/{id}`,
    `${base}/payments/single/${safe}`,
    {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fena get-payment ${res.status}: ${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text) as { data?: FenaPaymentStatus };
  if (!parsed.data?.id) throw new Error("Fena response missing data.id");
  return parsed.data;
}

export interface FenaListedPayment {
  id: string;
  status: string;
  amount: string;
  currency?: string;
  reference?: string;
  customerEmail?: string;
  customerName?: string;
  description?: string;
  paymentMethod?: string;
  isSandbox?: boolean;
  transaction?: string;
  createdAt?: string;
  completedAt?: string;
  [key: string]: unknown;
}

export async function fenaListPayments(limit = 50): Promise<FenaListedPayment[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const base = await getFenaBase();
  const res = await meteredFenaFetch(
    `GET /payments/single/list`,
    `${base}/payments/single/list?limit=${safeLimit}`,
    {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fena list-payments ${res.status}: ${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text) as { data?: { docs?: FenaListedPayment[] } };
  return Array.isArray(parsed.data?.docs) ? parsed.data!.docs! : [];
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
  provider?: string;
  creationType?: string;
  currency?: string;
  createdAt?: string;
  bankStatementAttachmentURL?: string;
  consentID?: string;
  bankConsentExpired?: "day-30" | "day-14" | "day-1" | "expired" | "up-to-date" | string;
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
  const parsed = await fenaJson<unknown>("/company/bank-accounts/list");
  return extractBankAccounts(parsed);
}

function extractBankAccounts(payload: unknown): FenaBankAccount[] {
  if (Array.isArray(payload)) return payload as FenaBankAccount[];
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  // Try common envelope keys in order.
  const candidates: unknown[] = [
    obj.docs,
    obj.data,
    obj.result,
    obj.results,
    obj.accounts,
    obj.bankAccounts,
    obj.items,
    obj.list,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as FenaBankAccount[];
    if (c && typeof c === "object") {
      const inner = c as Record<string, unknown>;
      for (const k of ["docs", "accounts", "bankAccounts", "items", "list", "data", "result"]) {
        if (Array.isArray(inner[k])) return inner[k] as FenaBankAccount[];
      }
    }
  }
  return [];
}

export async function fenaGetBankAccount(id: string): Promise<FenaBankAccount> {
  const parsed = await fenaJson<{ data?: FenaBankAccount; result?: FenaBankAccount }>(
    `/company/bank-accounts/${encodeURIComponent(id)}`,
  );
  const acc = parsed.data ?? parsed.result;
  if (!acc?.id) throw new Error("Fena bank-account response missing id");
  return acc;
}

export async function fenaRenameBankAccount(id: string, name: string): Promise<void> {
  await fenaJson(`/company/bank-accounts/${encodeURIComponent(id)}/edit-name`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function fenaSetDefaultBankAccount(id: string): Promise<void> {
  await fenaJson(`/company/bank-accounts/${encodeURIComponent(id)}/set-default`, {
    method: "PUT",
  });
}

export async function fenaConnectBankAccount(provider: string): Promise<string> {
  const parsed = await fenaJson<{ data?: { authUri?: string } }>(
    `/company/bank-accounts/connect`,
    { method: "POST", body: JSON.stringify({ provider }) },
  );
  const uri = parsed.data?.authUri;
  if (!uri || typeof uri !== "string") throw new Error("Fena connect response missing authUri");
  return uri;
}


/**
 * Server-only TrueLayer Payments v3 REST client.
 *
 * Docs: https://docs.truelayer.com/docs/quickstart-payments-v3
 *
 * Auth: client_credentials → bearer token (cached until ~60s before expiry).
 * Env split: TRUELAYER_ENV=sandbox routes via *.truelayer-sandbox.com,
 * otherwise production hosts. Mode is overridden per-call by the
 * `payment_gateways/truelayer.sandbox` setting (resolved by caller).
 *
 * NEVER import from client code.
 */

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
  sandbox: boolean;
}

let cachedToken: CachedToken | null = null;

function hosts(sandbox: boolean): { auth: string; api: string; hpp: string } {
  return sandbox
    ? {
        auth: "https://auth.truelayer-sandbox.com",
        api: "https://api.truelayer-sandbox.com",
        hpp: "https://payment.truelayer-sandbox.com",
      }
    : {
        auth: "https://auth.truelayer.com",
        api: "https://api.truelayer.com",
        hpp: "https://payment.truelayer.com",
      };
}

async function getAccessToken(sandbox: boolean): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.sandbox === sandbox && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }
  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("TrueLayer credentials not configured");

  const { auth } = hosts(sandbox);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "payments",
  });
  const res = await fetch(`${auth}/connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TrueLayer auth ${res.status}: ${text.slice(0, 300)}`);
  }
  const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) throw new Error("TrueLayer auth: no access_token");
  cachedToken = {
    token: parsed.access_token,
    expiresAt: now + (parsed.expires_in ?? 3600) * 1000,
    sandbox,
  };
  return parsed.access_token;
}

function randomIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * fetch() wrapper that retries idempotent failures (network errors, 5xx,
 * and 429) up to twice with exponential backoff (250ms, 750ms). Safe to
 * use for POSTs that carry an Idempotency-Key — TrueLayer guarantees
 * the same key returns the same payment.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const delays = [250, 750];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500 && res.status !== 429) return res;
      if (attempt === delays.length) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      if (attempt === delays.length) throw err;
    }
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchWithRetry failed");
}

export interface TrueLayerCreatePaymentInput {
  amountMinor: number;
  reference: string;
  userId: string;
  userName: string;
  userEmail?: string;
  returnUri: string;
  sandbox: boolean;
}

export interface TrueLayerCreatedPayment {
  id: string;
  resourceToken: string;
  status: string;
  hppUrl: string;
}

export async function truelayerCreatePayment(
  input: TrueLayerCreatePaymentInput,
): Promise<TrueLayerCreatedPayment> {
  const merchantAccountId = process.env.TRUELAYER_MERCHANT_ACCOUNT_ID;
  if (!merchantAccountId) throw new Error("TRUELAYER_MERCHANT_ACCOUNT_ID is not set");
  const token = await getAccessToken(input.sandbox);
  const { api, hpp } = hosts(input.sandbox);

  const body = {
    amount_in_minor: input.amountMinor,
    currency: "GBP",
    payment_method: {
      type: "bank_transfer",
      provider_selection: {
        type: "user_selected",
        filter: { countries: ["GB"], release_channel: "general_availability" },
      },
      beneficiary: {
        type: "merchant_account",
        merchant_account_id: merchantAccountId,
        reference: input.reference.slice(0, 18),
      },
    },
    user: {
      id: input.userId,
      name: input.userName.slice(0, 100),
      ...(input.userEmail ? { email: input.userEmail.slice(0, 254) } : {}),
    },
  };

  // POST /v3/payments — TrueLayer's API reference requires the /v3/ prefix
  // for all new integrations (the unversioned path is implicitly deprecated).
  const res = await fetchWithRetry(`${api}/v3/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": randomIdempotencyKey(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TrueLayer create-payment ${res.status}: ${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text) as {
    id?: string;
    resource_token?: string;
    status?: string;
  };
  if (!parsed.id || !parsed.resource_token) {
    throw new Error("TrueLayer create-payment: missing id/resource_token");
  }

  const hppUrl =
    `${hpp}/payments#payment_id=${encodeURIComponent(parsed.id)}` +
    `&resource_token=${encodeURIComponent(parsed.resource_token)}` +
    `&return_uri=${encodeURIComponent(input.returnUri)}`;

  return {
    id: parsed.id,
    resourceToken: parsed.resource_token,
    status: parsed.status ?? "authorization_required",
    hppUrl,
  };
}

export interface TrueLayerPaymentStatus {
  id: string;
  status: string;
  amount_in_minor?: number;
  reference?: string;
}

export async function truelayerGetPayment(
  paymentId: string,
  sandbox: boolean,
): Promise<TrueLayerPaymentStatus> {
  const token = await getAccessToken(sandbox);
  const { api } = hosts(sandbox);
  const res = await fetch(`${api}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TrueLayer get-payment ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as TrueLayerPaymentStatus;
}

/**
 * Dry-run: exchanges client credentials for a token. If this succeeds we
 * know the credentials reach TrueLayer and the merchant account env matches.
 */
export async function truelayerTestConnection(sandbox: boolean): Promise<{ ok: true; durationMs: number }> {
  const t0 = Date.now();
  await getAccessToken(sandbox);
  return { ok: true, durationMs: Date.now() - t0 };
}

/** Map TrueLayer payment status to our internal order status. */
export function mapTrueLayerStatus(status: string): "pending" | "paid" | "cancelled" {
  const s = status.toLowerCase();
  if (s === "executed" || s === "settled") return "paid";
  if (s === "failed") return "cancelled";
  return "pending";
}

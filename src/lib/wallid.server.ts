/**
 * Wallid Pay-by-Bank server helper.
 *
 * SERVER ONLY. Reads WALLID_KEY_ID / WALLID_KEY_SECRET from process.env
 * and talks to https://payment-api.wallid.co/api/payment-gw/v1.
 *
 * Never import this file from client code (filename .server.ts is blocked
 * from client bundles).
 */

const WALLID_BASE = "https://payment-api.wallid.co/api/payment-gw/v1";

export interface WallidItem {
  name: string;
  category?: string;
  price: number; // pounds (e.g. 19.99) — converted to minor units server-side
  image_url?: string;
  product_url?: string;
}

export interface CreateWallidPaymentInput {
  orderId: string;
  amount: number; // pounds
  currency: "GBP";
  customerEmail: string;
  items: WallidItem[];
  successUrl: string;
  failUrl: string;
}

export interface WallidCreateResponse {
  api_payment_id: string;
  payment_link: string;
  expires_at?: string;
  status?: string;
  [k: string]: unknown;
}

export interface WallidStatusResponse {
  api_payment_id: string;
  order_id?: string;
  status: string;
  amount?: number;
  currency?: string;
  [k: string]: unknown;
}

function authHeader(): string {
  const keyId = process.env.WALLID_KEY_ID;
  const keySecret = process.env.WALLID_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Wallid credentials missing (WALLID_KEY_ID / WALLID_KEY_SECRET).");
  }
  const token = Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function toMinor(amountPounds: number): number {
  return Math.round(Number(amountPounds) * 100);
}

async function wallidFetch(
  path: string,
  init: RequestInit,
  attempt = 0,
): Promise<Response> {
  try {
    const res = await fetch(`${WALLID_BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: authHeader(),
        ...(init.headers || {}),
      },
    });
    return res;
  } catch (err) {
    // Network error — retry once.
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 400));
      return wallidFetch(path, init, attempt + 1);
    }
    throw err;
  }
}

export class WallidError extends Error {
  status: number;
  body: string;
  userMessage: string;
  constructor(status: number, body: string, userMessage: string) {
    super(`Wallid ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
    this.userMessage = userMessage;
  }
}

export async function createWallidPayment(
  input: CreateWallidPaymentInput,
): Promise<WallidCreateResponse> {
  const payload = {
    order_id: input.orderId,
    amount: toMinor(input.amount),
    currency: input.currency,
    success_url: input.successUrl,
    fail_url: input.failUrl,
    customer_email: input.customerEmail,
    items: input.items.map((i) => ({
      name: i.name,
      category: i.category || "Research Peptides",
      price_minor: toMinor(i.price),
      image_url: i.image_url,
      product_url: i.product_url,
    })),
    description: `PH LABS Order ${input.orderId}`,
    locale: "en",
    country: "GB",
    metadata: { source: "phlabs.co.uk", customer_id: input.customerEmail },
  };

  const res = await wallidFetch("/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      console.error("[Wallid] Auth failed (401)", text.slice(0, 200));
      throw new WallidError(401, text, "Payment service unavailable");
    }
    if (res.status === 400) {
      console.error("[Wallid] Bad request (400)", text.slice(0, 200));
      throw new WallidError(400, text, "Invalid payment details");
    }
    console.error(`[Wallid] HTTP ${res.status}`, text.slice(0, 200));
    throw new WallidError(res.status, text, "Payment service error");
  }

  try {
    return JSON.parse(text) as WallidCreateResponse;
  } catch {
    throw new WallidError(502, text, "Payment service returned invalid response");
  }
}

export async function getWallidStatus(
  apiPaymentId: string,
): Promise<WallidStatusResponse> {
  const qs = new URLSearchParams({ apiPaymentId }).toString();
  const res = await wallidFetch(`/status?${qs}`, { method: "GET" });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new WallidError(401, text, "Payment service unavailable");
    }
    throw new WallidError(res.status, text, "Could not fetch payment status");
  }
  try {
    return JSON.parse(text) as WallidStatusResponse;
  } catch {
    throw new WallidError(502, text, "Payment service returned invalid response");
  }
}

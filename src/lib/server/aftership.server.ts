/**
 * AfterShip tracking client (server-only).
 *
 * Used to register Royal Mail (or any courier) tracking numbers so AfterShip
 * polls the courier for us and pushes a webhook the moment the parcel is
 * delivered. The webhook lands on /api/public/hooks/aftership.
 *
 * Secret: AFTERSHIP_API_KEY (never expose to the client bundle).
 */

const BASE = "https://api.aftership.com/tracking/2024-04";

function apiKey(): string {
  return (process.env.AFTERSHIP_API_KEY || "").trim();
}

export function aftershipConfigured(): boolean {
  return apiKey().length > 0;
}

async function request<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const key = apiKey();
  if (!key) return { ok: false, status: 0, data: null, error: "aftership_api_key_missing" };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        "as-api-key": key,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as
      | { data?: T; meta?: { code?: number; message?: string } }
      | null;
    if (!res.ok) {
      // 403 on a write means the API key was created without the
      // "Trackings: write" scope (reads still succeed) — surface that clearly.
      // 429 means the free plan's daily API quota is used up.
      const msg = (body?.meta?.message || "").toLowerCase();
      const hint =
        res.status === 403
          ? msg.includes("upgrade") || msg.includes("pro plan")
            ? "aftership_plan_required: the AfterShip account needs a paid (Pro) plan for API access"
            : "aftership_key_missing_write_permission"
          : res.status === 429
            ? `aftership_daily_quota_exceeded: ${body?.meta?.message || ""}`.trim()
            : body?.meta?.message || `aftership_status_${res.status}`;
      return { ok: false, status: res.status, data: null, error: hint };
    }

    return { ok: true, status: res.status, data: (body?.data ?? null) as T | null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface AftershipCheckpoint {
  checkpoint_time?: string;
  message?: string;
  location?: string;
  tag?: string;
  subtag_message?: string;
}

export interface AftershipTracking {
  id?: string;
  tracking_number?: string;
  slug?: string;
  tag?: string;
  subtag_message?: string;
  order_id?: string;
  checkpoints?: AftershipCheckpoint[];
}

export interface RegisterInput {
  trackingNumber: string;
  /** AfterShip courier slug — Royal Mail is `royal-mail`. */
  slug?: string;
  /** Our order id, echoed back on webhooks. */
  orderId?: string;
  email?: string;
  postcode?: string;
  title?: string;
}

/**
 * Register (or re-register) a tracking number. A 4003 "already exists"
 * response is treated as success — the tracker is live either way.
 */
export async function registerAftershipTracking(input: RegisterInput): Promise<{
  ok: boolean;
  alreadyExists?: boolean;
  trackingId?: string | null;
  error?: string;
}> {
  const base = {
    tracking_number: input.trackingNumber,
    ...(input.orderId ? { order_id: input.orderId } : {}),
    ...(input.email ? { emails: [input.email] } : {}),
    ...(input.postcode ? { tracking_postal_code: input.postcode } : {}),
    ...(input.title ? { title: input.title } : {}),
  };
  // 2024-04 API: flat body, tracking returned directly under `data`.
  // Default is AfterShip courier auto-detection — a hard-coded slug fails with
  // 4000 when that courier isn't activated on the account (free plans can't
  // always add Royal Mail manually).
  let res = await request<AftershipTracking>("/trackings", {
    method: "POST",
    body: { ...base, ...(input.slug ? { slug: input.slug } : {}) },
  });
  // Slug rejected (courier not activated) → retry with auto-detection.
  if (!res.ok && res.status === 400 && input.slug && !/exist/i.test(res.error || "")) {
    res = await request<AftershipTracking>("/trackings", { method: "POST", body: base });
  }
  if (res.ok) {
    return { ok: true, trackingId: res.data?.id ?? null };
  }
  if ((res.status === 400 || res.status === 409) && /exist/i.test(res.error || "")) {
    return { ok: true, alreadyExists: true };
  }
  return { ok: false, error: res.error };
}


/** Read the current tracking state (tag + checkpoints) for a parcel. */
export async function getAftershipTracking(
  trackingNumber: string,
  slug?: string,
): Promise<{ ok: boolean; tracking?: AftershipTracking | null; error?: string }> {
  // 2024-04 API: lookup by query params (the /{slug}/{number} path was removed).
  const res = await request<{ trackings?: AftershipTracking[] }>(
    `/trackings?tracking_numbers=${encodeURIComponent(trackingNumber)}${slug ? `&slug=${encodeURIComponent(slug)}` : ""}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, tracking: res.data?.trackings?.[0] ?? null };
}


/** AfterShip `tag` values that mean the parcel arrived. */
export function isDeliveredTag(tag?: string | null): boolean {
  return String(tag || "").toLowerCase() === "delivered";
}

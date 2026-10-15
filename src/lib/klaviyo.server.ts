/**
 * Klaviyo gateway helper (server-only). Sends only email, source and
 * sign-up date — never product or substance names.
 */
import { addDocAdmin, getDocAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/klaviyo";
const LIST_NAME = "PH Labs Newsletter";
const CONFIG_COLLECTION = "site_config";
const CONFIG_ID = "klaviyo";

function headers(): Record<string, string> {
  const lovable = process.env.LOVABLE_API_KEY;
  const key = process.env.KLAVIYO_API_KEY;
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!key) throw new Error("KLAVIYO_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": key,
    revision: "2026-07-15",
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

/** Fetch with backoff on 429/5xx; 4xx fails immediately. */
async function kfetch(path: string, init: RequestInit = {}): Promise<Response> {
  let delay = 1000;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${GATEWAY_URL}${path}`, { ...init, headers: headers() });
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, ra > 0 ? ra * 1000 : delay));
      delay *= 2;
      continue;
    }
    throw new Error(`Klaviyo request failed [${res.status}]: ${await res.text()}`);
  }
  throw new Error("Klaviyo request failed after retries");
}

export interface KlaviyoConfig {
  listId: string | null;
  listName: string | null;
  lastSyncAt: string | null;
  lastSyncResult: { sent: number; skipped: number; errors: number } | null;
}

export async function readKlaviyoConfig(): Promise<KlaviyoConfig> {
  const doc = (await getDocAdmin(CONFIG_COLLECTION, CONFIG_ID)) as Record<string, unknown> | null;
  return {
    listId: (doc?.listId as string) ?? null,
    listName: (doc?.listName as string) ?? null,
    lastSyncAt: (doc?.lastSyncAt as string) ?? null,
    lastSyncResult: (doc?.lastSyncResult as KlaviyoConfig["lastSyncResult"]) ?? null,
  };
}

export async function saveKlaviyoConfig(patch: Record<string, unknown>): Promise<void> {
  const existing = await getDocAdmin(CONFIG_COLLECTION, CONFIG_ID);
  if (existing) await updateDocAdmin(CONFIG_COLLECTION, CONFIG_ID, patch);
  else await addDocAdmin(CONFIG_COLLECTION, patch, CONFIG_ID);
}

/** Return the newsletter list ID, finding or creating "PH Labs Newsletter". */
export async function ensureNewsletterList(): Promise<{ id: string; name: string }> {
  const cfg = await readKlaviyoConfig();
  if (cfg.listId) return { id: cfg.listId, name: cfg.listName ?? LIST_NAME };
  const res = await kfetch(`/lists/?filter=${encodeURIComponent(`equals(name,"${LIST_NAME}")`)}`);
  const body = (await res.json()) as { data: { id: string }[] };
  let id = body.data[0]?.id;
  if (!id) {
    const created = await kfetch("/lists/", {
      method: "POST",
      body: JSON.stringify({ data: { type: "list", attributes: { name: LIST_NAME } } }),
    });
    id = ((await created.json()) as { data: { id: string } }).data.id;
  }
  await saveKlaviyoConfig({ listId: id, listName: LIST_NAME });
  return { id, name: LIST_NAME };
}

/** Subscribe up to 100 emails (with consent) to the newsletter list. */
export async function subscribeEmails(emails: { email: string; source: string }[]): Promise<void> {
  if (emails.length === 0) return;
  const list = await ensureNewsletterList();
  await kfetch("/profile-subscription-bulk-create-jobs/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          custom_source: "phlabs.co.uk",
          profiles: {
            data: emails.map((e) => ({
              type: "profile",
              attributes: {
                email: e.email,
                subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
              },
            })),
          },
        },
        relationships: { list: { data: { type: "list", id: list.id } } },
      },
    }),
  });
}

export async function klaviyoConnected(): Promise<boolean> {
  try {
    await kfetch("/accounts/");
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy every active Firestore newsletter subscriber to Klaviyo (deduped,
 * batches of 100). Idempotent: re-subscribing an existing profile is a no-op
 * in Klaviyo. Records the result and an auditLogs entry.
 */
export async function runSubscriberSync(actor: { uid: string; email: string | null }): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  const { listDocsAdmin } = await import("@/lib/server/firestore-admin");
  const docs = (await listDocsAdmin("emailSubscribers", { limit: 10000 })) as Record<string, unknown>[];
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const seen = new Set<string>();
  const toSend: { email: string; source: string }[] = [];
  let skipped = 0;
  for (const d of docs) {
    const email = String(d.email ?? "").trim().toLowerCase();
    const status = String(d.status ?? "active");
    if (!emailRe.test(email) || status !== "active" || d.deleted || seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    toSend.push({ email, source: String(d.source ?? "newsletter") });
  }
  let sent = 0;
  let errors = 0;
  for (let i = 0; i < toSend.length; i += 100) {
    const batch = toSend.slice(i, i + 100);
    try {
      await subscribeEmails(batch);
      sent += batch.length;
    } catch (err) {
      console.error("[klaviyo] batch failed:", err);
      errors += batch.length;
    }
  }
  const result = { sent, skipped, errors };
  await saveKlaviyoConfig({ lastSyncAt: new Date().toISOString(), lastSyncResult: result, lastSyncBy: actor.uid });
  await addDocAdmin("auditLogs", {
    action: "klaviyo.sync_subscribers",
    adminUid: actor.uid,
    adminEmail: actor.email,
    details: result,
    timestamp: new Date(),
  }).catch(() => undefined);
  return result;
}

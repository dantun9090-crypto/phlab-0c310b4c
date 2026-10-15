import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SubscribeInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.string().trim().max(40).regex(/^[a-z0-9_-]+$/i).default("popup"),
});

/** Public: mirror a newsletter sign-up into Klaviyo. Never throws to the client. */
export const subscribeNewsletterToKlaviyo = createServerFn({ method: "POST" })
  .inputValidator((d) => SubscribeInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const { subscribeEmails } = await import("./klaviyo.server");
      await subscribeEmails([{ email: data.email, source: data.source }]);
      return { ok: true };
    } catch (err) {
      console.error("[klaviyo] subscribe failed:", err);
      return { ok: false };
    }
  });

const TokenInput = z.object({ idToken: z.string().min(10).max(4096) });

export const getKlaviyoStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => TokenInput.parse(d))
  .handler(async ({ data }) => {
    const { requireFirebaseAdmin } = await import("./server/firebase-auth-admin");
    await requireFirebaseAdmin(data.idToken);
    const k = await import("./klaviyo.server");
    const connected = await k.klaviyoConnected();
    const cfg = await k.readKlaviyoConfig();
    return { connected, ...cfg };
  });

export const syncSubscribersToKlaviyo = createServerFn({ method: "POST" })
  .inputValidator((d) => TokenInput.parse(d))
  .handler(async ({ data }) => {
    const { requireFirebaseAdmin } = await import("./server/firebase-auth-admin");
    const admin = await requireFirebaseAdmin(data.idToken);
    const { listDocsAdmin, addDocAdmin } = await import("./server/firestore-admin");
    const k = await import("./klaviyo.server");

    const docs = (await listDocsAdmin("emailSubscribers", { limit: 10000 })) as Record<string, unknown>[];
    const seen = new Set<string>();
    const toSend: { email: string; source: string }[] = [];
    let skipped = 0;
    for (const d of docs) {
      const email = String(d.email ?? "").trim().toLowerCase();
      const status = String(d.status ?? "active");
      if (!z.string().email().safeParse(email).success || status !== "active" || d.deleted || seen.has(email)) {
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
        await k.subscribeEmails(batch);
        sent += batch.length;
      } catch (err) {
        console.error("[klaviyo] batch failed:", err);
        errors += batch.length;
      }
    }

    const result = { sent, skipped, errors };
    const now = new Date().toISOString();
    await k.saveKlaviyoConfig({ lastSyncAt: now, lastSyncResult: result });
    await addDocAdmin("auditLogs", {
      action: "klaviyo.sync_subscribers",
      adminUid: admin.uid,
      adminEmail: admin.email ?? null,
      details: result,
      timestamp: new Date(),
    }).catch(() => undefined);
    return result;
  });

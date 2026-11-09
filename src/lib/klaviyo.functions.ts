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

const UnsubscribeInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * Public: mirror a newsletter opt-out into Klaviyo (suppression only —
 * never re-subscribes anyone). Never throws to the client.
 */
export const unsubscribeNewsletterFromKlaviyo = createServerFn({ method: "POST" })
  .inputValidator((d) => UnsubscribeInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const { unsubscribeEmails } = await import("./klaviyo.server");
      await unsubscribeEmails([data.email]);
      return { ok: true };
    } catch (err) {
      console.error("[klaviyo] unsubscribe failed:", err);
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
    const { runSubscriberSync } = await import("./klaviyo.server");
    return runSubscriberSync({ uid: admin.uid, email: admin.email ?? null });
  });

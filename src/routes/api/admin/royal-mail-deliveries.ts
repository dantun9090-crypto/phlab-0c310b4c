/**
 * Royal Mail delivery sync — marks orders as `delivered` when Royal Mail
 * reports the parcel delivered.
 *
 * Flow:
 *   1. List orders with status `shipped` and a trackingNumber.
 *   2. For each, ask the royal-mail-order Worker (action: trackByNumber)
 *      whether RM reports delivery.
 *   3. On delivery: status → delivered (+ deliveredAt), activity log,
 *      customer status email (mail collection → Trigger Email extension),
 *      and the referral reward mirror (referrer £5 + count, reward email) —
 *      same semantics as the client-side updateOrderStatus delivered path.
 *
 * Auth (either):
 *   - x-cron-secret: CRON_SECRET (scheduled GitHub Actions run), or
 *   - JSON body { idToken } of an admin (Admin → Royal Mail "Sync deliveries"
 *     button), verified via customers/{uid}.isAdmin.
 *
 * POST returns a per-order summary { checked, delivered[], skipped[], errors[] }.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  addDocAdmin,
  getDocAdmin,
  listDocsAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { buildOrderStatusEmail } from "@/templates/orderStatusEmail";
import { buildReferralRewardEmail } from "@/templates/referralRewardEmail";

const WORKER_URL = "https://royal-mail-order.dantun9090.workers.dev";
const REWARD_THRESHOLD_GBP = 50;
const REWARD_AMOUNT_GBP = 5;

interface OrderRow {
  id: string;
  status?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  userEmail?: string;
  userName?: string;
  userId?: string;
}

interface TrackResult {
  success?: boolean;
  delivered?: boolean;
  status?: string;
  error?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Days after dispatch to auto-complete an order when Royal Mail gives us no
 * delivery scan (their Tracking API needs a paid entitlement). 0 disables it.
 */
function autoDeliverAfterDays(): number {
  const raw = Number((process.env.AUTO_DELIVER_AFTER_DAYS ?? "5").trim());
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

/** Best-effort dispatch timestamp from the order doc. */
function shippedTimestamp(order: Record<string, unknown>): Date | null {
  for (const key of ["shippedAt", "dispatchedAt", "labelCreatedAt", "updatedAt", "createdAt"]) {
    const v = order[key] as unknown;
    if (!v) continue;
    if (v instanceof Date) return v;
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const seconds = (v as { seconds?: number; _seconds?: number })?.seconds
      ?? (v as { _seconds?: number })?._seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000);
  }
  return null;
}


async function isAuthorized(request: Request): Promise<boolean> {
  const expected = (process.env.CRON_SECRET || "").trim();
  const provided = (request.headers.get("x-cron-secret") || "").trim();
  if (expected && provided === expected) return true;
  try {
    const body = (await request.clone().json().catch(() => null)) as { idToken?: unknown } | null;
    if (body && typeof body.idToken === "string" && body.idToken) {
      await requireFirebaseAdmin(body.idToken);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

async function checkDelivered(trackingNumber: string): Promise<TrackResult> {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-phlabs-auth": (process.env.ROYAL_MAIL_WORKER_TOKEN || "").trim(),
      },
      body: JSON.stringify({ action: "trackByNumber", trackingNumber }),
      signal: AbortSignal.timeout(15_000),
    });
    return (await res.json().catch(() => ({}))) as TrackResult;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendStatusEmail(order: OrderRow, orderId: string): Promise<void> {
  const email = order.userEmail;
  if (!email) return;
  const firstName = order.userName?.split(" ")[0] || "Customer";
  const html = buildOrderStatusEmail({
    firstName,
    email,
    orderId,
    status: "delivered",
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    courierName: "Royal Mail",
  });
  const shortId = orderId.slice(-8).toUpperCase();
  await addDocAdmin("mail", {
    to: email,
    message: {
      subject: `Order #${shortId} — Delivered`,
      html,
      text: `Order #${shortId} — Delivered`,
    },
    createdAt: new Date(),
  });
}

/** Mirror of client processReferralReward (delivered trigger). */
async function processReferralRewardAdmin(buyerUid: string): Promise<void> {
  try {
    const buyer = await getDocAdmin("customers", buyerUid);
    if (!buyer) return;
    const hasReferrer = typeof buyer.referredBy === "string" && buyer.referredBy.length > 0;
    const alreadyClaimed = buyer.referralRewardClaimed === true;
    const thresholdMet = Number(buyer.totalSpend || 0) >= REWARD_THRESHOLD_GBP;
    if (!hasReferrer || alreadyClaimed || !thresholdMet) return;

    await updateDocAdmin("customers", buyerUid, { referralRewardClaimed: true });

    const referrers = await listDocsAdmin("customers", {
      where: { field: "referralCode", value: buyer.referredBy as string },
      limit: 1,
    }).catch(() => []);
    const referrer = referrers[0] as ({ id: string } & Record<string, unknown>) | undefined;
    if (!referrer) return;

    const newBalance = Number(referrer.referralBalance || 0) + REWARD_AMOUNT_GBP;
    const newCount = Number(referrer.referralCount || 0) + 1;
    await updateDocAdmin("customers", referrer.id, {
      referralBalance: newBalance,
      referralCount: newCount,
    });

    const referrerEmail = typeof referrer.email === "string" ? referrer.email : null;
    if (referrerEmail) {
      const firstName =
        (typeof referrer.displayName === "string" && referrer.displayName.split(" ")[0]) || "there";
      const html = buildReferralRewardEmail({
        firstName,
        newReferralBalance: newBalance,
        referralCount: newCount,
      });
      await addDocAdmin("mail", {
        to: referrerEmail,
        message: {
          subject: `You earned £${REWARD_AMOUNT_GBP} — someone you referred just made their first purchase!`,
          html,
          text: `You earned £${REWARD_AMOUNT_GBP} — referral reward`,
        },
        createdAt: new Date(),
      });
    }
  } catch (err) {
    console.error("[royal-mail-deliveries] referral reward failed:", err);
  }
}

export const Route = createFileRoute("/api/admin/royal-mail-deliveries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorized(request))) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        const shipped = (await listDocsAdmin("orders", {
          where: { field: "status", value: "shipped" },
          limit: 200,
        }).catch(() => [])) as OrderRow[];

        const summary = {
          checked: 0,
          delivered: [] as string[],
          skipped: [] as string[],
          errors: [] as Array<{ orderId: string; error: string }>,
        };

        for (const order of shipped) {
          const tracking = (order.trackingNumber || "").trim();
          if (!tracking) {
            summary.skipped.push(`${order.id} (no tracking)`);
            continue;
          }
          summary.checked++;

          const track = await checkDelivered(tracking);
          let reason = "royal-mail";
          let statusText = track.status || "delivered";

          if (!track.delivered) {
            // Royal Mail's Tracking API requires a paid entitlement; when it is
            // unavailable (401/403) or the parcel simply has no delivery scan,
            // fall back to a time-based auto-complete so orders don't sit in
            // `shipped` forever. Configurable via AUTO_DELIVER_AFTER_DAYS
            // (set to 0 to disable).
            const days = autoDeliverAfterDays();
            const shippedAt = shippedTimestamp(order as Record<string, unknown>);
            const ageDays = shippedAt ? (Date.now() - shippedAt.getTime()) / 86_400_000 : null;

            if (!days || ageDays === null || ageDays < days) {
              if (track.error) summary.errors.push({ orderId: order.id, error: track.error });
              else summary.skipped.push(`${order.id} (${track.status || "in transit"})`);
              continue;
            }
            reason = "auto-timer";
            statusText = `Assumed delivered after ${days} days (no Royal Mail scan)`;
            summary.autoMarked.push(order.id);
          } else if (track.error) {
            summary.errors.push({ orderId: order.id, error: track.error });
            continue;
          }

          try {
            await updateDocAdmin("orders", order.id, {
              status: "delivered",
              deliveredAt: new Date(),
              deliveryStatusText: statusText,
              deliveryConfirmedBy: reason,
            });
            await addDocAdmin("activity", {
              type: "order",
              message: `Order #${order.id.slice(0, 8)} status → delivered (${
                reason === "auto-timer" ? "auto after delivery window" : "Royal Mail sync"
              })`,
              orderId: order.id,
              timestamp: new Date(),
            });
            await sendStatusEmail(order, order.id).catch((err) =>
              console.error("[royal-mail-deliveries] status email failed:", err),
            );
            if (order.userId) await processReferralRewardAdmin(order.userId);
            summary.delivered.push(order.id);
          } catch (err) {
            summary.errors.push({
              orderId: order.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }


        return json({ ok: true, ...summary });
      },
    },
  },
});

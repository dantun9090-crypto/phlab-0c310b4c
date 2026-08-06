/**
 * Shared "order delivered" side-effects, used by both the Royal Mail cron
 * sync and the AfterShip webhook. Semantics match the client-side
 * updateOrderStatus('delivered') path: status + deliveredAt, activity log,
 * customer status email (mail collection → Trigger Email extension) and the
 * referral reward mirror.
 */
import {
  addDocAdmin,
  getDocAdmin,
  listDocsAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { buildOrderStatusEmail } from "@/templates/orderStatusEmail";
import { buildReferralRewardEmail } from "@/templates/referralRewardEmail";

const REWARD_THRESHOLD_GBP = 50;
const REWARD_AMOUNT_GBP = 5;

export interface DeliverableOrder {
  id: string;
  status?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  userEmail?: string;
  userName?: string;
  userId?: string;
  courier?: string;
}

export async function sendDeliveredEmail(
  order: DeliverableOrder,
  courierName = "Royal Mail",
): Promise<void> {
  const email = order.userEmail;
  if (!email) return;
  const firstName = order.userName?.split(" ")[0] || "Customer";
  const html = buildOrderStatusEmail({
    firstName,
    email,
    orderId: order.id,
    status: "delivered",
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    courierName: order.courier || courierName,
  });
  const shortId = order.id.slice(-8).toUpperCase();
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
export async function processReferralRewardAdmin(buyerUid: string): Promise<void> {
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
    console.error("[mark-delivered] referral reward failed:", err);
  }
}

/**
 * Idempotent: marks the order delivered and fires the side-effects once.
 * Returns false when the order was already delivered.
 */
export async function markOrderDelivered(
  order: DeliverableOrder,
  opts: { statusText?: string; source: string; courierName?: string },
): Promise<boolean> {
  if (String(order.status || "").toLowerCase() === "delivered") return false;

  await updateDocAdmin("orders", order.id, {
    status: "delivered",
    deliveredAt: new Date(),
    deliveryStatusText: opts.statusText || "delivered",
  });
  await addDocAdmin("activity", {
    type: "order",
    message: `Order #${order.id.slice(0, 8)} status → delivered (${opts.source})`,
    orderId: order.id,
    timestamp: new Date(),
  });
  await sendDeliveredEmail(order, opts.courierName).catch((err) =>
    console.error("[mark-delivered] status email failed:", err),
  );
  if (order.userId) await processReferralRewardAdmin(order.userId);
  return true;
}

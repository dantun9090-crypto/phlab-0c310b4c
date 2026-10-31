/**
 * Throttled marketing email delivery.
 *
 * The mail host (OrangeWebsite cPanel) rejects anything above 100 outgoing
 * messages per hour and bounces the excess back to info@phlabs.co.uk. Marketing
 * campaigns therefore never write straight to `mail`; they land in
 * `marketingOutbox` and are released in batches so the total of ALL mail
 * (marketing + order emails) created in the last rolling hour stays under
 * MARKETING_HOURLY_CAP.
 *
 * Order/transactional emails keep using enqueueMailOnce directly and are
 * never delayed.
 *
 * Server-only.
 */
import { addDocAdmin, listDocsAdmin, updateDocAdmin } from "./firestore-admin";
import { enqueueMailOnce, type MailPayload } from "./enqueue-mail";

/** Max emails (all kinds) allowed to enter `mail` per rolling hour. */
export const MARKETING_HOURLY_CAP = 90;
export const OUTBOX_COLLECTION = "marketingOutbox";

/**
 * How many marketing emails may be released now.
 * @param sentLastHour mail docs created in the last 60 minutes (all sources)
 * @param pending outbox items still waiting
 */
export function releaseBudget(sentLastHour: number, pending: number, cap = MARKETING_HOURLY_CAP): number {
  return Math.max(0, Math.min(pending, cap - sentLastHour));
}

/** Put a marketing email in the throttled outbox (idempotent per docId). */
export async function queueMarketingMail(
  docId: string,
  payload: MailPayload,
): Promise<{ enqueued: boolean; duplicate: boolean }> {
  const safeId = docId.replace(/[^A-Za-z0-9_:-]/g, "_").slice(0, 1500);
  try {
    await addDocAdmin(
      OUTBOX_COLLECTION,
      { ...payload, status: "pending", queuedAt: new Date() },
      safeId,
    );
    return { enqueued: true, duplicate: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/409/.test(msg) || /ALREADY_EXISTS/i.test(msg)) return { enqueued: false, duplicate: true };
    throw err;
  }
}

/** Move as many pending outbox emails into `mail` as the hourly cap allows. */
export async function releaseMarketingBatch(): Promise<{ released: number; pending: number; sentLastHour: number }> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await listDocsAdmin("mail", {
    rangeFilter: { field: "createdAt", gte: since },
    limit: 1000,
  });
  const pendingRows = await listDocsAdmin(OUTBOX_COLLECTION, {
    where: { field: "status", value: "pending" },
    limit: 1000,
  });
  const budget = releaseBudget(recent.length, pendingRows.length);
  let released = 0;
  for (const row of pendingRows.slice(0, budget)) {
    const message = row.message as MailPayload["message"] | undefined;
    if (typeof row.to !== "string" || !message) {
      await updateDocAdmin(OUTBOX_COLLECTION, row.id, { status: "invalid" }).catch(() => undefined);
      continue;
    }
    try {
      await enqueueMailOnce(row.id, {
        to: row.to,
        message,
        source: typeof row.source === "string" ? row.source : "admin:marketing",
        campaignId: typeof row.campaignId === "string" ? row.campaignId : undefined,
      });
      await updateDocAdmin(OUTBOX_COLLECTION, row.id, { status: "released", releasedAt: new Date() });
      released++;
    } catch (err) {
      console.error("[marketing-drip] release failed", row.id, err);
    }
  }
  return { released, pending: pendingRows.length - released, sentLastHour: recent.length + released };
}

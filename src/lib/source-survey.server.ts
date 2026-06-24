/**
 * Server-only implementation of the post-purchase "How did you find us?"
 * survey. Updates the order document with the answer and enforces the
 * one-time SAVE10 reward per email address.
 *
 * Caller MUST prove ownership of the order via either:
 *   a) Firebase ID token whose uid matches `orders/{orderId}.userId`, or
 *   b) one-time `paymentToken` whose SHA-256 hash matches
 *      `orders/{orderId}.paymentTokenHash` (guest checkout).
 *
 * Without ownership, the order id alone (guessable `PHP-*` format) would
 * let an attacker corrupt acquisition analytics and trigger SAVE10
 * discount emails to arbitrary customers.
 *
 * NEVER import from client code.
 */
import { z } from "zod";
import {
  getDocAdmin,
  updateDocAdmin,
  findDocByFieldAdmin,
  addDocAdmin,
} from "./server/firestore-admin";
import { verifyFirebaseIdToken } from "./server/firebase-auth-admin";

export const SURVEY_SOURCES = [
  "google_search",
  "advertisement",
  "referral",
  "social_media",
  "other",
] as const;

const authFields = {
  idToken: z.string().min(10).max(4096).optional().nullable(),
  paymentToken: z.string().min(32).max(256).optional().nullable(),
};

export const submitSurveySchema = z.object({
  orderId: z
    .string()
    .min(4)
    .max(64)
    .regex(/^PHP-[A-Z0-9-]+$/i),
  source: z.enum(SURVEY_SOURCES),
  otherText: z.string().trim().max(200).optional().nullable(),
  ...authFields,
});

export const skipSurveySchema = z.object({
  orderId: z
    .string()
    .min(4)
    .max(64)
    .regex(/^PHP-[A-Z0-9-]+$/i),
  ...authFields,
});

export type SubmitSurveyInput = z.infer<typeof submitSurveySchema>;
export type SkipSurveyInput = z.infer<typeof skipSurveySchema>;

export interface SubmitSurveyResult {
  ok: true;
  rewardCode: string | null; // null when email already claimed SAVE10
}

const SAVE10_CODE = "SAVE10";

function emailKey(email: string): string {
  // Firestore doc IDs can't contain '/', but emails are otherwise safe.
  return email.trim().toLowerCase().replace(/\//g, "_");
}

async function verifyPaymentTokenHash(rawToken: string, storedHash: unknown): Promise<boolean> {
  if (typeof storedHash !== "string" || !storedHash) return false;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  const candidate = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Loads the order and verifies the caller owns it. Throws a generic
 * "Order not found" error on any failure so attackers can't distinguish
 * "no such order" from "order exists, wrong credentials".
 */
async function loadOwnedOrder(
  orderId: string,
  idToken: string | null | undefined,
  paymentToken: string | null | undefined,
): Promise<Record<string, unknown>> {
  const id = orderId.toUpperCase();
  const order = await getDocAdmin("orders", id).catch(() => null);
  if (!order) throw new Error("Order not found");

  let userUid: string | null = null;
  if (idToken) {
    try {
      const user = await verifyFirebaseIdToken(idToken);
      userUid = user.uid;
    } catch {
      userUid = null;
    }
  }

  const ownerUid = typeof order.userId === "string" ? order.userId : null;
  const ownsByUid = userUid !== null && ownerUid !== null && ownerUid === userUid;
  const ownsByToken = paymentToken
    ? await verifyPaymentTokenHash(
        paymentToken,
        (order as { paymentTokenHash?: unknown }).paymentTokenHash,
      )
    : false;

  if (!ownsByUid && !ownsByToken) {
    throw new Error("Order not found");
  }
  return order;
}

export async function runSubmitSurvey(
  input: SubmitSurveyInput,
): Promise<SubmitSurveyResult> {
  const id = input.orderId.toUpperCase();
  const order = await loadOwnedOrder(id, input.idToken, input.paymentToken);

  const customer = (order.customer ?? {}) as Record<string, unknown>;
  const email = String(customer.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("Order has no email");

  // Record the survey answer on the order (idempotent — last answer wins).
  await updateDocAdmin("orders", id, {
    sourceSurvey: {
      source: input.source,
      otherText: input.source === "other" ? (input.otherText ?? "").trim() || null : null,
      submittedAt: new Date(),
    },
    surveySkipped: false,
  });

  // Check whether this email has already received / used SAVE10.
  const claimId = emailKey(email);
  const claim = await getDocAdmin("save10_claims", claimId);
  const alreadyClaimed = !!claim;

  if (alreadyClaimed) {
    return { ok: true, rewardCode: null };
  }

  // First time — issue the code and persist eligibility on customer record.
  await addDocAdmin(
    "save10_claims",
    {
      email,
      orderId: id,
      issuedAt: new Date(),
      used: false,
      source: input.source,
    },
    claimId,
  );

  // Best-effort flag on the customer record keyed by email.
  try {
    const existing = await findDocByFieldAdmin("customers", "email", email);
    if (existing && existing.__id) {
      await updateDocAdmin("customers", String(existing.__id), {
        save10Eligible: true,
        save10Used: false,
      });
    }
  } catch {
    // Non-fatal — the canonical record is in save10_claims.
  }

  return { ok: true, rewardCode: SAVE10_CODE };
}

export async function runSkipSurvey(input: SkipSurveyInput): Promise<{ ok: true }> {
  const id = input.orderId.toUpperCase();
  await loadOwnedOrder(id, input.idToken, input.paymentToken);

  await updateDocAdmin("orders", id, {
    surveySkipped: true,
    sourceSurvey: null,
  });
  return { ok: true };
}

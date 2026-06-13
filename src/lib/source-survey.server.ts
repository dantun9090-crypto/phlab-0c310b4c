/**
 * Server-only implementation of the post-purchase "How did you find us?"
 * survey. Updates the order document with the answer and enforces the
 * one-time SAVE10 reward per email address.
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

export const SURVEY_SOURCES = [
  "google_search",
  "advertisement",
  "referral",
  "social_media",
  "other",
] as const;

export const submitSurveySchema = z.object({
  orderId: z
    .string()
    .min(4)
    .max(64)
    .regex(/^PHP-[A-Z0-9-]+$/i),
  source: z.enum(SURVEY_SOURCES),
  otherText: z.string().trim().max(200).optional().nullable(),
});

export const skipSurveySchema = z.object({
  orderId: z
    .string()
    .min(4)
    .max(64)
    .regex(/^PHP-[A-Z0-9-]+$/i),
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

export async function runSubmitSurvey(
  input: SubmitSurveyInput,
): Promise<SubmitSurveyResult> {
  const order = await getDocAdmin("orders", input.orderId.toUpperCase());
  if (!order) throw new Error("Order not found");

  const customer = (order.customer ?? {}) as Record<string, unknown>;
  const email = String(customer.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("Order has no email");

  // Record the survey answer on the order (idempotent — last answer wins).
  await updateDocAdmin("orders", input.orderId.toUpperCase(), {
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
      orderId: input.orderId.toUpperCase(),
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
  const order = await getDocAdmin("orders", id);
  if (!order) throw new Error("Order not found");

  await updateDocAdmin("orders", id, {
    surveySkipped: true,
    sourceSurvey: null,
  });
  return { ok: true };
}

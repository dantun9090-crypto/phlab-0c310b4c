#!/usr/bin/env node
/**
 * Fixture helper for the source-survey E2E test harness.
 *
 * Reads/writes Firestore using `firebase-admin` and the
 * `FIREBASE_SERVICE_ACCOUNT_JSON` env var (same service account the server
 * functions use). Designed to be called from `scripts/e2e-survey-http.py`
 * via `node scripts/e2e-survey-fixture.mjs <command> [args...]`. Every
 * command prints a single JSON line to stdout for easy parsing.
 *
 * Commands:
 *
 *   seed
 *     Creates a fresh `orders/PHP-E2E-<ts>` document with a known
 *     `paymentTokenHash` (sha256 of a fresh random token) and a userId
 *     that no Firebase ID token can ever match. Prints:
 *       { ok, orderId, paymentToken, email, userId }
 *     The plaintext paymentToken is returned ONCE and never persisted.
 *
 *   snapshot <orderId> <email>
 *     Returns the current observable survey state. Used to verify that
 *     blocked requests do NOT mutate Firestore:
 *       {
 *         ok,
 *         order: { exists, sourceSurvey, surveySkipped, _updatedAt },
 *         save10Claim: { exists, ... } | null
 *       }
 *
 *   cleanup <orderId> <email>
 *     Deletes the seeded order doc and any save10_claims doc keyed by
 *     emailKey(email). Idempotent.
 *
 * Exits non-zero on any failure (missing env, Firestore error, etc.).
 */
import { createHash, randomBytes } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

function die(msg) {
  process.stderr.write(`[fixture] ${msg}\n`);
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) die("FIREBASE_SERVICE_ACCOUNT_JSON is not set");

let serviceAccount;
try {
  serviceAccount = JSON.parse(raw);
} catch (e) {
  die(`FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${e.message}`);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// Same key normalisation runSubmitSurvey uses for save10_claims doc IDs.
function emailKey(email) {
  return String(email).trim().toLowerCase().replaceAll("/", "_");
}

function sha256Hex(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function cmdSeed() {
  const ts = Date.now();
  const orderId = `PHP-E2E-${ts}-${randomBytes(3).toString("hex").toUpperCase()}`;
  // 64-char hex token — well above the 32-char Zod minimum. Generated
  // fresh per run; only the hash is persisted.
  const paymentToken = randomBytes(32).toString("hex");
  const paymentTokenHash = sha256Hex(paymentToken);
  const email = `e2e+${ts}@phlabs-e2e.invalid`;
  // A UID that's syntactically valid but cannot be minted by Firebase
  // Auth, so no ID token will ever satisfy the uid branch.
  const userId = `e2e-test-uid-${ts}-no-real-account`;

  await db.collection("orders").doc(orderId).set({
    userId,
    customer: { email },
    paymentTokenHash,
    status: "pending",
    currency: "GBP",
    productId: "e2e-fixture",
    quantity: 1,
    totalPrice: 1,
    createdAt: Timestamp.now(),
    isE2EFixture: true,
  });

  process.stdout.write(
    JSON.stringify({ ok: true, orderId, paymentToken, email, userId }) + "\n",
  );
}

async function cmdSnapshot(orderId, email) {
  if (!orderId || !email) die("snapshot requires <orderId> <email>");
  const orderSnap = await db.collection("orders").doc(orderId).get();
  const claimSnap = await db.collection("save10_claims").doc(emailKey(email)).get();

  const orderData = orderSnap.exists ? orderSnap.data() : null;
  process.stdout.write(
    JSON.stringify({
      ok: true,
      order: {
        exists: orderSnap.exists,
        sourceSurvey: orderData?.sourceSurvey ?? null,
        surveySkipped: orderData?.surveySkipped ?? null,
      },
      save10Claim: claimSnap.exists ? { exists: true, ...claimSnap.data() } : null,
    }) + "\n",
  );
}

async function cmdCleanup(orderId, email) {
  if (!orderId || !email) die("cleanup requires <orderId> <email>");
  await db.collection("orders").doc(orderId).delete().catch(() => {});
  await db
    .collection("save10_claims")
    .doc(emailKey(email))
    .delete()
    .catch(() => {});
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
}

const [, , cmd, ...args] = process.argv;
const handlers = { seed: cmdSeed, snapshot: cmdSnapshot, cleanup: cmdCleanup };
const fn = handlers[cmd];
if (!fn) die(`unknown command: ${cmd ?? "(none)"} (expected seed|snapshot|cleanup)`);
fn(...args).catch((err) => die(err?.stack || String(err)));

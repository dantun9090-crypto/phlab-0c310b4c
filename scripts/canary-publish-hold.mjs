#!/usr/bin/env node
/**
 * Called by the canary workflow when a rollback / publish-hold is
 * recommended. POSTs an HMAC-signed body to /api/public/publish-hold.
 *
 * Required env:
 *   PUBLISH_HOLD_URL     — e.g. https://phlabs.co.uk/api/public/publish-hold
 *   PUBLISH_HOLD_SECRET  — shared secret with the endpoint
 *   BUILD_ID             — flagged build id
 *   REASON               — free text (from workflow summary)
 * Optional:
 *   BOOT_BAD_IN_WINDOW, FAILURES_IN_WINDOW, HOLD ("true"/"false", default "true")
 */
import { createHmac } from "node:crypto";

const {
  PUBLISH_HOLD_URL,
  PUBLISH_HOLD_SECRET,
  BUILD_ID,
  REASON,
  BOOT_BAD_IN_WINDOW = "0",
  FAILURES_IN_WINDOW = "0",
  HOLD = "true",
} = process.env;

if (!PUBLISH_HOLD_URL || !PUBLISH_HOLD_SECRET || !BUILD_ID) {
  console.error("[publish-hold] missing env — skipping (PUBLISH_HOLD_URL/SECRET/BUILD_ID required)");
  process.exit(0);
}

const body = JSON.stringify({
  buildId: BUILD_ID,
  reason: REASON || "canary threshold exceeded",
  source: "canary",
  bootBadInWindow: Number(BOOT_BAD_IN_WINDOW),
  failuresInWindow: Number(FAILURES_IN_WINDOW),
  hold: HOLD !== "false",
});
const sig = "sha256=" + createHmac("sha256", PUBLISH_HOLD_SECRET).update(body).digest("hex");

const res = await fetch(PUBLISH_HOLD_URL, {
  method: "POST",
  headers: { "content-type": "application/json", "x-phl-signature": sig },
  body,
});
const text = await res.text();
console.log(`[publish-hold] ${res.status} ${text.slice(0, 400)}`);
if (!res.ok) process.exit(1);

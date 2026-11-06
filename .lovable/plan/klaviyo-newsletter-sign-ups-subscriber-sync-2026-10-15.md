# Klaviyo: newsletter sign-ups + subscriber sync

## Goal
Every newsletter sign-up (popup, home page, footer) also lands in Klaviyo with proper marketing consent. All current subscribers get copied over once. Firestore `emailSubscribers` stays the main record, and nothing that works today gets removed.

## Steps
1. **Connect Klaviyo** to the project (a connect card will appear). The private key needs `accounts:read`, `lists:read`, `lists:write`, `profiles:write`, `subscriptions:write`.
2. **List:** create (or reuse, if it already exists) a list called **"PH Labs Newsletter"**. Its ID is saved in Firestore `site_config/klaviyo`, so it can be changed later without code.
3. **Live sign-ups:** after the normal Firestore save in `src/lib/newsletter.ts`, call a server function that subscribes the email to the list with consent `SUBSCRIBED` and source `phlabs.co.uk`. If Klaviyo fails, the sign-up still works; the error goes into the log only.
4. **One-off sync:** add an admin button "Sync to Klaviyo" in Admin → Newsletter. It sends existing subscribers in batches of 100 and skips anyone who unsubscribed or whose data was deleted (privacy request). It shows a count of sent / skipped / errors, and each run is logged in `auditLogs`.
5. **Admin panel:** the Newsletter tab shows Klaviyo status (connected, list name, last sync).

## Out of scope
No changes to checkout, payments, order events, Google Ads, how pages look, or robots/CSP. No product or substance names are sent to Klaviyo; only email, source and sign-up date.

## Technical details
- `src/lib/klaviyo.server.ts`: gateway helper (`profile-subscription-bulk-create-jobs/`, `lists/`, revision `2026-07-15`, 429 backoff, no retries on 4xx).
- `src/lib/klaviyo.functions.ts`: `subscribeNewsletterToKlaviyo` (public, zod email validation) and `syncSubscribersToKlaviyo` / `getKlaviyoStatus` (`requireFirebaseAdmin`).
- Firebase Admin reads subscribers; secrets stay server-side only.
- Verification: test sign-up, check the profile in Klaviyo, run the sync, then build.

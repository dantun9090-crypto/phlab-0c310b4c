# Google Ads — end-to-end check (read-only)

Full audit of the advertising chain from ad click through to a recorded sale. Nothing is changed: no budgets, no ad texts, no conversion settings, no keywords or exclusions. Any problem found is reported with a proposed fix for your approval.

## What gets checked, in the order money flows

1. **Account and campaign**
   - Campaign status, daily budget, spend over the last 14 and 30 days.
   - Clicks, impressions, cost, conversions and conversion value per day, so unusual days stand out.
   - Any account-level alerts or policy notices.

2. **Ads and assets**
   - The asset group: headlines, descriptions, images, logos, business name.
   - Approval status of every asset, plus anything disapproved or limited.
   - Check texts still match the agreed research-use-only wording, with no claims and no substance names.

3. **Where clicks land**
   - Final URLs actually used by the campaign, confirmed to answer correctly on the live site (no redirect chains, no missing pages).
   - Confirm the click identifier is captured when a visitor arrives, so a later sale can be matched back to the ad.

4. **Conversion recording**
   - Conversion actions: which one counts as primary, which as secondary, and whether the intended setup is still in place.
   - Whether website purchase events reach the browser tag on the order-confirmation pages.
   - Whether the offline import route is running and posting paid orders.
   - Compare the number of paid orders in the shop against conversions recorded in Ads for the same period, and report the gap.

5. **Shopping side**
   - Merchant feed availability and item count for both the full feed and the ads-safe feed.
   - Any disapprovals showing against the feed.

6. **Search terms and waste**
   - Recent search terms, flagging obvious waste that the current exclusion list does not cover.
   - Reported as a suggestion list only — no exclusions added.

## Deliverable

A single report with:
- A green/amber/red line per area above.
- Confirmed numbers, not guesses, with the source of each.
- A ranked list of problems, each with the fix I would apply, so you approve or reject one at a time.

## Technical notes

Read-only Google Ads API calls (campaign, asset group, asset, conversion action, search term reports). Live checks against `https://phlabs.co.uk` for landing pages and both feed endpoints. Paid-order counts read from Firestore `orders`. Conversion tag and click-capture behaviour verified by reading `src/lib/analytics.ts`, `src/lib/gclid-capture.ts`, `src/routes/checkout.success.tsx`, `src/routes/payment.success.tsx`, and `src/routes/api/public/hooks/offline-conversions.ts`, plus a real browser pass on a test success URL to see whether the conversion hit leaves the browser. No mutations anywhere.

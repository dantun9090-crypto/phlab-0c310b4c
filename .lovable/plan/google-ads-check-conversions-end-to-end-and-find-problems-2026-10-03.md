# Google Ads: check conversions end to end and find problems

This is a full check of the path from an ad click to a counted sale. It also looks for problems along the way. The check only reads data. Nothing in Google Ads changes until you approve each fix. Fixes on the shop side, such as a broken page or a missed click record, are also proposed first.

## What gets checked, step by step

1. **Click capture.** When someone arrives from an ad, the shop should save the click with the order. I'll measure what share of paid orders over the last 7 and 30 days have a saved click. A falling share means sales are being lost from tracking.
2. **Ad landing pages.** Every page the ads link to should open without a redirect or a missing page.
3. **Sale recorded in the browser.** After both Wallid and BrokkrPay payments, the confirmation page should send the "Purchase (website)" event to Google. I'll also check that a page refresh doesn't send it twice.
4. **Daily conversions file.** This is the file Google Ads collects every morning. I'll check that today's file is available and lists the right paid orders, with no duplicates and no wrong amounts. I'll also check in Google Ads whether this morning's collection worked.
5. **Conversion settings in Google Ads.** I'll confirm which conversion counts as the main one and which is secondary. I'll also find out why Google shows about 4,660 "conversions" against about 140 real orders: which extra action is being counted, and whether it misleads the automatic bidding.
6. **Shop vs Google comparison.** For the last 14 days, I'll compare paid orders with a saved click against the conversions Google recorded, and report the gap.
7. **Ads, product feed and wasted spend.** This covers rejected or limited ads, product feed errors in Merchant Center, and search terms that waste money. Search terms come as a list of suggestions only.

## What you get

- A report in Polish with green, amber or red for each step, using real numbers.
- A ranked list of errors and improvements. For each one I'll say what I would change and the expected effect, so you can approve or reject them one at a time.
- Nothing in Google Ads changes without your OK. No changes to payments, prices, the conversions file's address or its daily schedule, or the website tracking.

## Technical details

- These are read-only Google Ads API calls (customer 4410206709): conversion_action, campaign and search_term_view reports, plus the offline data upload diagnostics.
- Firestore `orders` data for paid orders with `adClickIds` or a gclid.
- Code reads: `src/lib/gclid-capture.ts`, `src/lib/analytics.ts`, `src/routes/checkout.success.tsx`, `src/routes/payment.success.tsx`, `src/routes/api/public/hooks/offline-conversions.ts`.
- A curl request for the CSV using CRON_SECRET (headers only and a row count, with no customer data), and curl requests for the landing pages and feeds.

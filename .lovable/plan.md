# Move VIP products to a separate Firestore collection (security fix)

## Problem
`product_stock` allows public reads, and the Firebase API key is public. So anyone can read VIP product names, prices and the `isVip` flag through the Firestore REST API. Today VIP filtering only hides products in the page layout. The data itself is not protected.

## Steps (in this exact order)

1. **Rules for `product_stock_vip`** in `firestore.rules`:
   - read: `isAdmin()` OR a signed-in user where `get(customers/{uid}).data.get('isVip', false) == true`. The rule is wrapped in an `exists()` check, so a missing customer document is denied cleanly instead of erroring.
   - write: `isAdmin()` only.
   - The `product_stock` rules stay unchanged.

2. **Deploy the rules first** (`firebase deploy --only firestore:rules` using the service account). If the deploy can't run from here, I'll say so explicitly and stop at this step so you can deploy it manually.

3. **Publish the code that reads both collections** (steps 5 to 8 below). Before publishing, I'll show you the full diff and run the build and typecheck. After publishing, I'll purge the Cloudflare cache.

4. **Migrate the data** with a one-time Admin SDK script:
   - Dry run: list every document with `isVip: true` and write a JSON backup to Files (`/mnt/documents/vip-products-backup-<date>.json`) so you can download it before anything is deleted.
   - Copy each document to `product_stock_vip` with the same ID and all fields. `isVip: true` stays, for admin display only.
   - Compare each copy field by field with its original. Only after a match is the original deleted from `product_stock`.

5. **VipStore page:** reads only from `product_stock_vip`. The old `product_stock` read and its `isVip` filter are removed.

6. **Admin ProductEditor:** the VIP toggle moves the product in a single transaction (write to the target collection, delete from the source) and adds an `auditLogs` entry. The admin product list merges both collections and shows a VIP badge.

7. **Server side, full scope:** I'll search the whole repo for every server-side read of `product_stock` by document ID. That covers cart validation, order creation, stock decrement, order emails, invoices, Wallid/BrokkrPay webhooks and fulfilment. Each of these falls back to `product_stock_vip` through the service account when a product isn't in `product_stock`. Checkout is fail-closed: a VIP-collection product passes only for a VIP or admin buyer. Every other buyer's cart is rejected exactly as today. Code that runs after payment (stock decrement, emails, webhooks) just reads the product, with no buyer check.

8. **VIP product page (same URL and slug):** if a product isn't in `product_stock` and the signed-in viewer is a VIP or admin, the page loads it from `product_stock_vip` and renders it normally. Everyone else gets the same not-found page as today.

9. **Unchanged:** Google Merchant feed, sitemap and prerender. They read only `product_stock`, so VIP products are excluded automatically. The existing app-level `isVip` filters stay as a safety net. The storefront look, checkout and payments stay untouched. No URL or slug changes.

## Verification
- `cart-validation.test.ts`: a VIP product is rejected for a non-VIP buyer and accepted for a VIP buyer.
- After the rules deploy: an anonymous REST request to `product_stock_vip` returns 403 PERMISSION_DENIED.
- After the migration: `product_stock` has zero documents with `isVip: true`, and VIP Store, the VIP product page and checkout work for a VIP account.
- Build and typecheck pass. You see the full diff before publishing.

# Fix stretched card logos at checkout

On mobile the Mastercard / Visa / Google Pay / Apple Pay logos under "Debit or credit card" are squashed sideways and stretched tall.

## Change (presentation only)
In `src/components/PaymentMethodOptions.tsx`, the logo row:
- Give every logo the same fixed size (about 48 x 32 px, a normal card-badge shape) with `object-contain`, so the image keeps its proportions.
- Add `shrink-0` so the row can no longer squeeze them, and `flex-wrap` so they drop to a second line on very narrow phones instead of distorting.
- Keep the white rounded badge look, order and spacing as they are.

No changes to payment behaviour, text, or order. Visual-test snapshots and lockfiles untouched.

## Check
Screenshot the checkout at a phone width to confirm the logos look normal, then publish and purge the Cloudflare cache.

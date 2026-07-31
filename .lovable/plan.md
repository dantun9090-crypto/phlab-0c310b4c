# UK postcode → address lookup at checkout

Add automatic address lookup when a UK customer types their postcode, so they don't type city/region by hand. Free provider now, paid full-address provider ready to switch on later.

## How it will work for the customer

1. Country = United Kingdom, customer types a postcode in the existing postcode field.
2. After a short pause (debounce ~500 ms) and only when the postcode looks valid, a "Find address" lookup runs automatically. A small "Find address" button sits next to the field as a manual fallback.
3. Free mode (active from day one): city/town and county are filled in automatically, with a subtle "Address found — 112… street line still needed" hint. The customer only types the street + house number.
4. Paid mode (off until an API key is added): a dropdown of full addresses for that postcode appears; picking one fills street line, city and county in one click.
5. Nothing is forced — every field stays editable, and manual entry works exactly as today. Non-UK countries (DE, PL, IE, Other) are untouched.

## What stays the same

- Checkout design, layout, colours, field order and validation rules stay as they are.
- No changes to order creation, pricing, payment (Wallid), or any non-UK logic.

## Technical notes

- New `src/lib/postcode-lookup.functions.ts` (thin server-fn wrapper) + `src/lib/postcode-lookup.server.ts` with the implementation:
  - Provider chosen at runtime: if `GETADDRESS_API_KEY` (or `IDEAL_POSTCODES_API_KEY`) is present → full-address provider; otherwise → `api.postcodes.io/postcodes/{pc}` (free, no key, town/county only).
  - Normalised return shape: `{ mode: 'outcode' | 'full', city, county, addresses: { line1, city, county }[] }` so the UI code is identical for both modes.
  - Server-side: postcode normalised and regex-validated before the outbound call, request timeout ~5 s, in-memory cache per postcode, generic error messages only (no upstream details leaked), and a small per-request rate guard.
- New `src/components/checkout/PostcodeLookup.tsx`: debounced lookup, loading state, optional address `<select>`, "Enter address manually" escape hatch. Uses existing input styles (`border-2 border-slate-600`, `bg-slate-800`, `min-h-[48px]`, `rounded-lg`).
- `src/pages/Checkout/index.tsx`: minimal wiring only — render the lookup helper under the existing postcode field when `form.country === 'United Kingdom'`, and a callback that calls the existing `setField` for `address` / `city`. No restructuring of the form.
- CSP: the lookup runs server-side, so no new `connect-src` origin is needed.
- Admin panel: add the lookup provider status (free / paid, key present or not) to the relevant admin settings tab so the admin UI reflects the change.
- Tests: unit test for postcode normalisation + provider selection + malformed-response handling; one Playwright check that typing a valid UK postcode fills the city field and that manual entry still works.

## Later switch to full addresses

When you get a getAddress.io (or Ideal Postcodes) key, it is added as a secret and the paid mode turns on automatically — no code change or redeploy of logic needed.

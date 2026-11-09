# Fix: checkout rejects named-property addresses (e.g. "The Fox Den")

## What is happening
Customer address: The Fox Den, Spring Lane, Malvern, WR14 1AJ. The postcode is valid (confirmed with the UK postcode database). The house has a name, not a number.

The checkout field is labelled "House no. / name", but the check only accepts a name if it contains words like Cottage, House, Farm, Lodge, Barn, Mill. "The Fox Den" has none of them, so the customer sees "Add your house number or property name…" and cannot continue. The only way through today is to tap "No house number" first. That button is easy to miss.

## Fix (no design or layout changes)
1. If the "House no. / name" box holds a real name (letters, not "0"), accept it as a named property. Checkout continues and the order is marked "no house number" so the server accepts it too.
2. Accept more common property-name forms in the address check: anything starting with "The …" (The Fox Den, The Willows), plus extra words such as Den, Nook, Retreat, Chalet, Stables, Coach House, Oast, Court and View.
3. The server keeps the same rule, so Royal Mail labels still need either a number or a property name. Bare street addresses like "Spring Lane" are still rejected.
4. Add tests: "The Fox Den, Spring Lane" passes; "Spring Lane" alone fails; "0 Spring Lane" fails.

## For the customer right now
Reply on WhatsApp: tap **"No house number"**, put "The Fox Den, Spring Lane" in Street Address and the town as Malvern. That works today, before the fix goes live.

## After approval
Run tests, publish and purge the Cloudflare cache. Then check the checkout on a phone with this exact address.

## Technical
- `src/lib/uk-address.ts`: widen `NAMED_PROPERTY_RE` and add a `^the\s+\w+` named-property rule.
- `src/pages/Checkout/index.tsx`: before validating, if `houseNumber` contains letters and is not zero-like, treat it as `addressNoHouseNumber = true` for validation and in the order payload. The server in `create-order.server.ts` stays unchanged and uses the shared validator.
- New test: `tests/uk-address-named-property.test.ts`.

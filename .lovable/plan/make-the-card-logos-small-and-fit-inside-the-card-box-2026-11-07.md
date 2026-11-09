# Make the card logos small and fit inside the card box

## What you will see
Under "Debit or credit card", the four logos (Mastercard, Visa, Google Pay, Apple Pay) show as small, equal badges about 34 x 22 px, in one straight row, all inside the green card box. Nothing else on the checkout changes.

## Why they are huge now
A site-wide rule forces every lazy-loaded picture to be at least 100 px tall. That overrides the 22 px height we set, so each logo grows to about 156 x 100 px and spills out of the box.

## Change
In `src/components/PaymentMethodOptions.tsx`, on the four logo images only:
- Remove `loading="lazy"` (they are tiny and visible straight away).
- Give each a fixed size: width 34 px, height 22 px, `minHeight: 0`, `object-contain`, small rounded corners and soft shadow.
- Keep the row single-line with a small gap.

No change to the site-wide rule, payment logic, other payment options or layout.

## After the change
- Check on a phone-sized screen in the checkout payment step that all four logos sit inside the box.
- Publish to phlabs.co.uk and clear the Cloudflare cache.

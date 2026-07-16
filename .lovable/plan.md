## Goal
Make the "Free UK Shipping over £50" sticky bar on the Home page visible on **all viewports** (currently mobile-only).

## Change
In `src/pages/Home/index.tsx` at line 1355, remove the `sm:hidden` class from the sticky bar container so it renders on desktop too. It stays fixed to the bottom, home-page only (already scoped inside the Home component).

- Before: `<div className="sm:hidden fixed bottom-0 left-0 right-0 z-30" ...>`
- After:  `<div className="fixed bottom-0 left-0 right-0 z-30" ...>`

No layout, styling, or content changes beyond removing that one class. The bar keeps its dark background, emerald accent, Shop Now CTA, and safe-area padding.

## Note
If desktop content gets covered by the bar, I can add bottom padding to the page footer spacer in a follow-up — flag it after you see it live.
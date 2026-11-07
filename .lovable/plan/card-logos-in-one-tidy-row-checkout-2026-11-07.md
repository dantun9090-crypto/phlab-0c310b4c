## Card logos in one tidy row (checkout)

Goal: Mastercard, Visa, Google Pay and Apple Pay sit side by side in a single line, same size, no tall empty boxes — on phone and desktop.

### Change (presentation only, `src/components/PaymentMethodOptions.tsx`, card logo row)
- Row: `flex flex-nowrap items-center gap-1.5` (no wrapping to a second line).
- Wrap each logo in a fixed box `span` (`h-7 w-11 shrink-0 overflow-hidden rounded-md shadow-sm`) and make the image fill it with `h-full w-full object-contain` and inline `style={{height:'100%',width:'100%'}}` so a global `img { height:auto }` rule can no longer stretch it (this is why boxes look tall).
- Keep alt text, aria-label, data-testids, payment logic untouched.

### After
- Check on 360px and 1280px widths in preview (screenshot), publish, purge Cloudflare cache.

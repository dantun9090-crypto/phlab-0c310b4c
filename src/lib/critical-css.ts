/**
 * Critical above-the-fold CSS for the site shell.
 *
 * Inlined into every HTML response via `<style>` in <head> (see __root.tsx)
 * so first paint doesn't wait on the main stylesheet, which is loaded
 * non-blocking via media=print swap.
 *
 * Keep this small (<3 KB). Includes only: reset, boot bg/fg, header
 * skeleton, banner stack reserved heights (CLS prevention), boot spinner.
 * Full Tailwind layer applies as soon as appCss loads (~100ms typical).
 *
 * Exported as a module constant so the build script
 * `scripts/emit-csp-style-hash.ts` can compute the SHA-256 hash for the
 * CSP `style-src 'sha256-...'` directive without regex-scraping JSX.
 */
export const CRITICAL_CSS_BASE = `
*,*::before,*::after{box-sizing:border-box;border-width:0;border-style:solid;min-width:0}
html,body,#root{max-width:100%;overflow-x:hidden;margin:0;background:#060f1e;color:#f0f6ff}
body{font-family:'Inter Tight','Inter Tight Fallback',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
h1,h2,h3{font-family:'Cormorant Garamond','Cormorant Garamond Fallback',Georgia,serif;margin:0;line-height:1.08;letter-spacing:-.01em}
img,svg,video{display:block;max-width:100%;height:auto}
header{top:0;z-index:50;min-height:64px;background:rgba(6,15,30,.92);border-bottom:1px solid rgba(255,255,255,.06)}
@media(min-width:768px){header{min-height:64px}}
.site-header,.navbar{min-height:64px}
.site-logo,.site-logo img,.site-logo svg{max-height:48px!important;width:auto!important;height:auto!important;display:block}
.site-logo-wrap{height:48px;width:48px;display:flex;align-items:center;justify-content:center;flex:0 0 48px}
[data-phl-banner]{min-height:32px}
[data-phl-research-banner]{min-height:34px}
.phl-boot{display:flex;align-items:center;justify-content:center;min-height:60vh;color:#9fb0c8;font-size:14px}`;

/** Landing-only block: emitted only on /compound and /landing/* routes (it
 *  adds ~11 KB of above-the-fold rules those pages need; other routes would
 *  pay HTML bytes for no benefit). */
export const CRITICAL_CSS_LANDING = `
/* Landing pages above the fold (/compound, /landing/phlabs): top bar, hero,
   promo strip, trust strip, day/night toggle. Layout-affecting declarations
   (box metrics, flex/grid, font metrics incl. text-transform — uppercase is
   wider and re-wraps flex rows, content-visibility) lifted 1:1 from the
   built Tailwind sheet for exactly the classes those components use, plus
   the Tailwind preflight (margin/padding/font resets). Without this block
   first paint uses UA margins/default button styles, then re-flows when the
   deferred stylesheet lands — measured CLS 0.14-0.46 in the Lighthouse gate.
   Values are identical to the final sheet, so its arrival changes nothing
   visually. */
/* -- App-wide mobile layout rules (from src/styles.css) that change box
      metrics on narrow screens; duplicated here so first paint matches the
      deferred sheet exactly -- */
h1, h2, .font-display { letter-spacing: -0.01em; }
@media (max-width: 640px) {
  html { font-size: 16px; }
  body { font-size: 1rem; line-height: 1.6; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  p, li, dd, dt, blockquote, label, figcaption, small { line-height: 1.6; }
  h1 { line-height: 1.2; }
  h2, h3 { line-height: 1.25; }
  h4, h5, h6 { line-height: 1.3; }
}
@media (max-width: 768px) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  select, textarea { font-size: 16px; }
}
@media (max-width: 640px) {
  button, a[role="button"], [role="button"], input[type="button"],
  input[type="submit"], input[type="reset"], summary { min-height: 44px; min-width: 44px; }
  nav a, [role="menu"] a, [role="menuitem"], li > a:only-child { min-height: 44px; display: inline-flex; align-items: center; }
  nav a + a, [role="menu"] a + a, li + li > a { margin-top: 4px; }
}
/* Layer order must match the built sheet, or these earlier-loading
   duplicates would hijack the cascade (unlayered beats layered) and
   break utility overrides on every page. */
@layer theme, base, components, utilities;
/* -- Tailwind preflight (verbatim, paint-only rules dropped) -- */
@layer base {
*,:after,:before,::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}html,:host{-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;font-family:var(--default-font-family,ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji");font-feature-settings:var(--default-font-feature-settings,normal);font-variation-settings:var(--default-font-variation-settings,normal);-webkit-tap-highlight-color:transparent}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,samp,pre{font-family:var(--default-mono-font-family,ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);font-feature-settings:var(--default-mono-font-feature-settings,normal);font-variation-settings:var(--default-mono-font-variation-settings,normal);font-size:1em}small{font-size:80%}sub,sup{vertical-align:baseline;font-size:75%;line-height:0;position:relative}sub{bottom:-.25em}sup{top:-.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}:-moz-focusring{outline:auto}progress{vertical-align:baseline}summary{display:list-item}ol,ul,menu{list-style:none}img,svg,video,canvas,audio,iframe,embed,object{vertical-align:middle;display:block}img,video{max-width:100%;height:auto}button,input,select,optgroup,textarea{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}::file-selector-button{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}:where(select:is([multiple],[size])) optgroup{font-weight:bolder}:where(select:is([multiple],[size])) optgroup option{padding-inline-start:20px}::file-selector-button{margin-inline-end:4px}::placeholder{opacity:1}@supports (not ((-webkit-appearance:-apple-pay-button))) or (contain-intrinsic-size:1px){::placeholder{color:currentColor}@supports (color:color-mix(in lab,red,red)){::placeholder{color:color-mix(in oklab,currentcolor 50%,transparent)}}}textarea{resize:vertical}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-date-and-time-value{min-height:1lh;text-align:inherit}::-webkit-datetime-edit{display:inline-flex}::-webkit-datetime-edit-fields-wrapper{padding:0}::-webkit-datetime-edit{padding-block:0}::-webkit-datetime-edit-year-field{padding-block:0}::-webkit-datetime-edit-month-field{padding-block:0}::-webkit-datetime-edit-day-field{padding-block:0}::-webkit-datetime-edit-hour-field{padding-block:0}::-webkit-datetime-edit-minute-field{padding-block:0}::-webkit-datetime-edit-second-field{padding-block:0}::-webkit-datetime-edit-millisecond-field{padding-block:0}::-webkit-datetime-edit-meridiem-field{padding-block:0}::-webkit-calendar-picker-indicator{line-height:1}:-moz-ui-invalid{box-shadow:none}button,input:where([type=button],[type=reset],[type=submit]){appearance:button}::file-selector-button{appearance:button}::-webkit-inner-spin-button{height:auto}::-webkit-outer-spin-button{height:auto}[hidden]:where(:not([hidden=until-found])){display:none!important}body,#root{max-width:100%;overflow-x:clip}
}
@layer utilities {
:root{--container-2xl:42rem;--container-6xl:72rem;--container-7xl:80rem;--container-lg:32rem;--font-weight-bold:700;--font-weight-light:300;--font-weight-medium:500;--font-weight-semibold:600;--spacing:.25rem;--text-2xl:1.5rem;--text-2xl--line-height:calc(2 / 1.5);--text-3xl:1.875rem;--text-3xl--line-height:1.2 ;--text-base:1rem;--text-base--line-height:1.5 ;--text-lg:1.125rem;--text-lg--line-height:calc(1.75 / 1.125);--text-sm:.875rem;--text-sm--line-height:calc(1.25 / .875);--text-xs:.75rem;--text-xs--line-height:calc(1 / .75);--tracking-tight:-.025em;--tracking-wide:.025em;--tracking-wider:.05em;--tw-leading:initial}
.absolute{position:absolute}
.block{display:block}
.border-b{border-bottom-width:1px}
.border-l{border-left-width:1px}
.border-t{border-top-width:1px}
.bottom-4{bottom:calc(var(--spacing) * 4)}
.fixed{position:fixed}
.flex{display:flex}
.flex-col{flex-direction:column}
.flex-wrap{flex-wrap:wrap}
.font-bold{font-weight:var(--font-weight-bold)}
.font-light{font-weight:var(--font-weight-light)}
.font-medium{font-weight:var(--font-weight-medium)}
.font-semibold{font-weight:var(--font-weight-semibold)}
.gap-0{gap:calc(var(--spacing) * 0)}
.gap-2{gap:calc(var(--spacing) * 2)}
.gap-2\\.5{gap:calc(var(--spacing) * 2.5)}
.gap-3{gap:calc(var(--spacing) * 3)}
.gap-4{gap:calc(var(--spacing) * 4)}
.gap-6{gap:calc(var(--spacing) * 6)}
.gap-x-4{column-gap:calc(var(--spacing) * 4)}
.gap-y-2{row-gap:calc(var(--spacing) * 2)}
.grid{display:grid}
.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.h-1\\.5{height:calc(var(--spacing) * 1.5)}
.h-10{height:calc(var(--spacing) * 10)}
.h-\\[18px\\]{height:18px}
.h-full{height:100%}
.h-px{height:1px}
.hidden{display:none}
.inline-block{display:inline-block}
.inline-flex{display:inline-flex}
.inset-0{inset:calc(var(--spacing) * 0)}
.italic{font-style:italic}
.items-center{align-items:center}
.justify-between{justify-content:space-between}
.justify-center{justify-content:center}
.leading-\\[1\\.02\\]{--tw-leading:1.02;line-height:1.02}
.leading-\\[1\\.7\\]{--tw-leading:1.7;line-height:1.7}
.leading-none{--tw-leading:1;line-height:1}
.left-4{left:calc(var(--spacing) * 4)}
@media(min-width:64rem){.lg\\:min-h-\\[96vh\\]{min-height:96vh}}
@media(min-width:64rem){.lg\\:py-36{padding-block:calc(var(--spacing) * 36)}}
@media(min-width:64rem){.lg\\:text-\\[6\\.5rem\\]{font-size:6.5rem}}
.max-w-2xl{max-width:var(--container-2xl)}
.max-w-6xl{max-width:var(--container-6xl)}
.max-w-7xl{max-width:var(--container-7xl)}
.max-w-lg{max-width:var(--container-lg)}
.mb-12{margin-bottom:calc(var(--spacing) * 12)}
@media(min-width:48rem){.md\\:border-l{border-left-width:1px}}
@media(min-width:48rem){.md\\:border-t-0{border-top-width:0}}
@media(min-width:48rem){.md\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(min-width:48rem){.md\\:inline{display:inline}}
@media(min-width:48rem){.md\\:px-6{padding-inline:calc(var(--spacing) * 6)}}
@media(min-width:48rem){.md\\:py-6{padding-block:calc(var(--spacing) * 6)}}
@media(min-width:48rem){.md\\:text-3xl{font-size:var(--text-3xl);line-height:var(--tw-leading,var(--text-3xl--line-height))}}
@media(min-width:48rem){.md\\:text-\\[5\\.5rem\\]{font-size:5.5rem}}
@media(min-width:48rem){.md\\:text-sm{font-size:var(--text-sm);line-height:var(--tw-leading,var(--text-sm--line-height))}}
@media(min-width:48rem){.md\\:text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}}
.min-h-\\[44px\\]{min-height:44px}
.min-h-\\[85vh\\]{min-height:85vh}
.min-h-screen{min-height:100vh}
.min-w-\\[44px\\]{min-width:44px}
.ml-1{margin-left:calc(var(--spacing) * 1)}
.ml-3{margin-left:calc(var(--spacing) * 3)}
.mt-1{margin-top:calc(var(--spacing) * 1)}
.mt-1\\.5{margin-top:calc(var(--spacing) * 1.5)}
.mt-10{margin-top:calc(var(--spacing) * 10)}
.mt-14{margin-top:calc(var(--spacing) * 14)}
.mt-24{margin-top:calc(var(--spacing) * 24)}
.mt-6{margin-top:calc(var(--spacing) * 6)}
.mt-8{margin-top:calc(var(--spacing) * 8)}
.mx-auto{margin-inline:auto}
.object-cover{object-fit:cover}
.overflow-hidden{overflow:hidden}
.px-10{padding-inline:calc(var(--spacing) * 10)}
.px-2\\.5{padding-inline:calc(var(--spacing) * 2.5)}
.px-3{padding-inline:calc(var(--spacing) * 3)}
.px-4{padding-inline:calc(var(--spacing) * 4)}
.px-6{padding-inline:calc(var(--spacing) * 6)}
.py-1{padding-block:calc(var(--spacing) * 1)}
.py-1\\.5{padding-block:calc(var(--spacing) * 1.5)}
.py-2\\.5{padding-block:calc(var(--spacing) * 2.5)}
.py-28{padding-block:calc(var(--spacing) * 28)}
.py-3\\.5{padding-block:calc(var(--spacing) * 3.5)}
.py-4{padding-block:calc(var(--spacing) * 4)}
.py-5{padding-block:calc(var(--spacing) * 5)}
.py-7{padding-block:calc(var(--spacing) * 7)}
.relative{position:relative}
@media(min-width:40rem){.sm\\:flex-row{flex-direction:row}}
@media(min-width:40rem){.sm\\:inline{display:inline}}
@media(min-width:40rem){.sm\\:min-h-\\[92vh\\]{min-height:92vh}}
@media(min-width:40rem){.sm\\:px-6{padding-inline:calc(var(--spacing) * 6)}}
@media(min-width:40rem){.sm\\:text-3xl{font-size:var(--text-3xl);line-height:var(--tw-leading,var(--text-3xl--line-height))}}
@media(min-width:40rem){.sm\\:text-\\[12px\\]{font-size:12px}}
@media(min-width:40rem){.sm\\:text-\\[13px\\]{font-size:13px}}
@media(min-width:40rem){.sm\\:text-\\[4\\.2rem\\]{font-size:4.2rem}}
@media(min-width:40rem){.sm\\:text-lg{font-size:var(--text-lg);line-height:var(--tw-leading,var(--text-lg--line-height))}}
.sr-only{white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}
.sr-only{white-space:nowrap;border:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}
.sticky{position:sticky}
.text-2xl{font-size:var(--text-2xl);line-height:var(--tw-leading,var(--text-2xl--line-height))}
.text-\\[1\\.75rem\\]{font-size:1.75rem}
.text-\\[10\\.5px\\]{font-size:10.5px}
.text-\\[10px\\]{font-size:10px}
.text-\\[11px\\]{font-size:11px}
.text-\\[12px\\]{font-size:12px}
.text-\\[2\\.8rem\\]{font-size:2.8rem}
.text-base{font-size:var(--text-base);line-height:var(--tw-leading,var(--text-base--line-height))}
.text-center{text-align:center}
.text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}
.top-0{top:calc(var(--spacing) * 0)}
.tracking-\\[0\\.18em\\]{letter-spacing:.18em}
.tracking-\\[0\\.2em\\]{letter-spacing:.2em}
.tracking-\\[0\\.35em\\]{letter-spacing:.35em}
.tracking-\\[0\\.3em\\]{letter-spacing:.3em}
.tracking-\\[0\\.45em\\]{letter-spacing:.45em}
.tracking-tight{letter-spacing:var(--tracking-tight)}
.tracking-wide{letter-spacing:var(--tracking-wide)}
.tracking-wider{letter-spacing:var(--tracking-wider)}
.uppercase{text-transform:uppercase}
.w-1\\.5{width:calc(var(--spacing) * 1.5)}
.w-10{width:calc(var(--spacing) * 10)}
.w-14{width:calc(var(--spacing) * 14)}
.w-20{width:calc(var(--spacing) * 20)}
.w-\\[18px\\]{width:18px}
.w-full{width:100%}
.z-30{z-index:30}
.z-40{z-index:40}
}
`;

/** Full sheet (base + landing) — kept for tooling that hashes the whole thing. */
export const CRITICAL_CSS = CRITICAL_CSS_BASE + CRITICAL_CSS_LANDING;

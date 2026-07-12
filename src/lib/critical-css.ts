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
export const CRITICAL_CSS = `
*,*::before,*::after{box-sizing:border-box;border-width:0;border-style:solid;min-width:0}
html,body,#root{max-width:100%;overflow-x:hidden;margin:0;background:#060f1e;color:#f0f6ff}
body{font-family:'Inter Tight','Inter Tight Fallback',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
h1,h2,h3{font-family:'Cormorant Garamond','Cormorant Garamond Fallback',Georgia,serif;margin:0;line-height:1.08;letter-spacing:-.015em}
img,svg,video{display:block;max-width:100%;height:auto}
header{top:0;z-index:50;min-height:64px;background:rgba(6,15,30,.92);border-bottom:1px solid rgba(255,255,255,.06)}
@media(min-width:768px){header{min-height:64px}}
.site-header,.navbar{min-height:64px}
.site-logo,.site-logo img,.site-logo svg{max-height:48px!important;width:auto!important;height:auto!important;display:block}
.site-logo-wrap{height:48px;width:48px;display:flex;align-items:center;justify-content:center;flex:0 0 48px}
[data-phl-banner]{min-height:32px}
[data-phl-research-banner]{min-height:34px}
.phl-boot{display:flex;align-items:center;justify-content:center;min-height:60vh;color:#9fb0c8;font-size:14px}
`;

# Smart Banner — Admin Controls + Desktop-Only Centered Popup

## Goal

The existing `<SmartBanner>` (config-driven, separate from the image "Promo Banner") should be fully controllable from the admin panel and behave as a **desktop-only centered floating popup** — bigger, closable with an X — never rendered on mobile.

## Scope

- New admin sub-section inside the existing **Promo Banner** tab (`src/pages/Admin/tabs/BannerTab.tsx`) called **"Smart Banner (text popup)"**, kept clearly separated from the current image banner controls so nothing existing changes.
- Persisted to Firestore at `settings/smartBanner` (new doc — does not touch existing `settings/promoBanner`).
- Runtime `<SmartBanner>` reads live config from Firestore via a small subscription hook, falling back to `src/config/banner.config.ts` defaults.

## Admin controls (new section)

Bound to Firestore `settings/smartBanner`:

- Enabled toggle (on/off)
- Message text
- CTA label + CTA link
- Background color — color picker (hex)
- Text color — color picker (hex)
- Font size — dropdown: `text-xs → text-2xl`
- Banner size — dropdown: `compact / normal / large`
- Position — dropdown: `center / top-right / top-left / bottom-right / bottom-left` (default `center`)
- Delay before show (ms) — number
- Dismiss duration (hours) — number
- Live preview panel (renders `<SmartBanner config={...} />` inline in the admin card)
- Save Changes / Refresh buttons, matching existing BannerTab styling (no redesign)

Save flow reuses the existing pattern: `setDoc(doc(db,'settings','smartBanner'), …)` + `triggerContentCdnInvalidation(['/'])` + `bumpMarketingVersion()`.

## Runtime changes to `<SmartBanner>`

- Add `"center"` to `BannerPosition` (in `src/config/banner.config.ts`) → renders `fixed inset-0 flex items-center justify-center` wrapper.
- **Desktop-only**: when viewport `< 1024px`, component renders `null`. No mobile inline banner (matches user's request).
- Bigger default popup: `max-width` bumped to `min(560px, calc(100vw - 48px))` when position is center, with larger padding.
- Existing dismiss-with-X behavior preserved (localStorage `phl_banner_dismissed`, TTL from config).
- New hook `useSmartBannerConfig()` in `src/lib/smart-banner-config.ts`:
  - `onSnapshot(doc(db,'settings','smartBanner'))` merged over `bannerConfig` defaults
  - SSR-safe (returns defaults until hydrated) — no `window` at module scope
- `<SmartBanner />` (no-props usage in `src/pages/Home/index.tsx`) internally calls the hook. Admin preview passes explicit `config` prop → hook is bypassed.

## Files touched

- `src/config/banner.config.ts` — add `"center"` to `BannerPosition` union.
- `src/components/SmartBanner.tsx` — desktop-only guard, center-position layout, larger sizing, consume `useSmartBannerConfig()` when no `config` prop.
- `src/lib/smart-banner-config.ts` *(new)* — types, defaults merge, `useSmartBannerConfig` hook, `saveSmartBannerConfig` writer.
- `src/pages/Admin/tabs/BannerTab.tsx` — append new "Smart Banner (text popup)" card at the bottom of the existing layout. Existing image-banner code untouched.

## Non-goals / guardrails

- Existing image "Promo Banner" (`settings/promoBanner`) is not modified.
- No mobile inline rendering (per request).
- No new design system, no header/layout changes, no Firestore rules changes (settings/* already admin-write / public-read under current rules).
- Typecheck + build must pass before finishing.

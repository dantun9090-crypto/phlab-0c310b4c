# Ads analysis + site conversion work

## What the account actually allows (checked live, last 30 days)

The account runs **one** campaign: "Performance Max" (£51/day). Every other campaign is removed with zero spend. That changes three of your ten prompts, because Performance Max has no keywords and no text-ad auction data:

| Your prompt | Possible? | Why |
|---|---|---|
| 1 — wasted spend + negatives | Partly | Google reports search **categories** with impressions, clicks and conversions, but **no cost per category** in Performance Max. So "spend > £10 with 0 conversions" cannot be produced. I can rank zero-conversion categories by clicks instead, and propose negatives (campaign-level negatives are allowed). |
| 2 — Quality Score | No | Quality Score only exists on keywords. There are no keywords in the account. |
| 3 — winning search terms → new keywords | Partly | I can list converting categories from 90 days, but there is nowhere to add keywords. Value is real though: they become page copy and a future Search campaign. |
| 4 — device / location / hour | Yes | Full segment data available. Note: Performance Max has no hour-of-day or device bid adjustments, so output is insight, not bid tweaks. |
| 5 — RSA audit | No | No responsive search ads. Only the one asset group "PH" (rated POOR). Headline suggestions are still possible, as asset-group copy. |
| 6 — budget shifts between campaigns | Partly | There is only one campaign, so nothing to shift between. I can report spend, cost per order and impression share lost to budget. |

Already visible from the read I ran: brand/competitor searches ("anglo peptides", "swisschems", "phoenix peptides", "umbrella labs", "zentra peptides", "biotech peptides", "oxford labs peptides", "supreme peptides", "proforma peptides", "biohack peptides") and pure information searches ("what is nad+", "nad+ benefits", "injectable water") pull impressions with almost no clicks or orders — the natural first negative list.

## Part A — Ads analysis (read-only, nothing changes on the account)

Delivered as a chat report, in Polish, with an accept/reject list you sign off before anything is touched:

1. **Where budget leaks** — zero-conversion search categories ranked by clicks and impressions, plus a proposed negative-keyword list (competitor brands, information-only searches, non-product searches), stated as a proposal only.
2. **Device, location, hour** — cost per order and conversion rate by device, region and hour of day, with what it implies (and a clear note that Performance Max cannot take hour/device bid adjustments).
3. **Winning searches, 90 days** — converting categories you have no landing page for, marked as candidates for page copy and a possible future Search campaign.
4. **Budget reality** — spend, cost per order, impression share lost to budget for the single campaign; a budget recommendation only if your target cost per order or margin is on the table, otherwise stated as unavailable.
5. **Asset group copy** — three new headline variants for the weakest slots in asset group "PH", research-use framing, no health claims. For your approval; nothing published.

Skipped with reason stated: Quality Score, RSA-level CTR, cross-campaign budget shifts.

## Part B — Site changes (implemented)

6. **Message match (prompt 7)** — align the H1 and hero copy on `/`, `/products`, `/compound` and `/research` with the top converting searches (retatrutide/reta, MOTS-C, GHK-Cu, bacteriostatic water, "tested peptides UK"). Research framing, UK spelling, no claims. Diff shown before saving; no URL, slug, canonical, JSON-LD or feed link changes.
7. **Speed (prompt 8)** — hero image preloaded with high fetch priority on the four routes, below-fold sections lazily mounted, entry bundle trimmed. LCP measured before and after.
8. **Trust at the buy button (prompt 9)** — next to "Add to cart": a "Batch verified — check COA" badge linking to `/verify` (only when the verification feature is on), "≥99% purity, third-party tested" sourced from real lab data, payment icons, dispatch time. Existing colours, spacing and header untouched.
9. **Order value (prompt 10)** — "Frequently researched together" (2–3 products, 10% bundle discount) on the product page, and an "Add £X for free shipping" bar in the cart.

## Technical notes

- Ads work goes through the existing Google Ads connection, read-only (GAQL `campaign`, `campaign_search_term_insight`, `asset_group`, device/geo/hour segments). Any mutation waits for your approval card.
- Untouched: conversion actions, goals, offline import, GTM-MT4BZ2X8, dataLayer, `/metrics`, `/api/public/hooks/*`, checkout flow, CSP in `src/server.ts`, Wallid.
- Copy changes stay inside existing components (`src/routes/index.tsx`, `src/legacy/LegacySsrShell.tsx` hero, `src/routes/products.tsx`, `_marketing.compound.tsx`, research routes). No new routes are planned, so `KNOWN_PUBLIC_ROUTES` stays as is; if one is added, it goes into `src/lib/sitemap-audit.functions.ts` in the same change.
- Bundle discount and free-shipping threshold are presentation plus cart maths only — no payment or order-creation logic changes.
- `bunx tsgo --noEmit` and `bun run build` must pass; RUO notice preserved everywhere.

## Order of work

Analysis first (1 and 3 above), then message match, then speed, then trust badges, then order value. Each site step lands with the diff shown.

## Open question

The free-shipping threshold and the bundle discount need your numbers: what order value should unlock free shipping, and is 10% off a 2–3 item bundle acceptable on your margins?

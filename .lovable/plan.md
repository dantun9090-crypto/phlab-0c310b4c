
## What gets built

A new admin section **Merchant Feeds → Editor** that gives 100% control over the 4 XML feeds with zero code changes:

```
phlabs.co.uk/google-merchant-feed.xml          (phlabs · paid)
phlabs.co.uk/google-merchant-feed-free.xml     (phlabs · free)
prohealthpeptides.co.uk/google-merchant-feed.xml      (prohealth · paid)   ← new dedicated route
prohealthpeptides.co.uk/google-merchant-feed-free.xml (prohealth · free)   ← new dedicated route
```

Each feed becomes a fully independent, Firestore-driven document. Edits in admin → next feed fetch by Google reflects them. No redeploy.

## UI: `MerchantFeedEditorTab.tsx`

Sub-tabbed by feed (4 tabs across the top):

```
[ phlabs · paid ] [ phlabs · free ] [ prohealth · paid ] [ prohealth · free ]
```

Inside each feed tab:

1. **Global feed settings** card
   - Channel name, base URL, brand, currency, `google_product_category` (id + path), default `product_type`, `condition`, `identifier_exists`, `age_group`, `adult` flag
   - Default title pattern (template string with `{name} {size} {brand}` tokens)
   - Default description template
   - Default disclaimers block (multiline)
   - Promotion IDs (chips)
   - Shipping (country / service / price)
   - Cache TTL (s-maxage) & Surrogate-Control TTL

2. **Risk rules** card (was hard-coded `HIGH_RISK_TOKENS` + `MERCHANT_CODE_OVERRIDES`)
   - Banned-token list (chips, add/remove)
   - Hard-blocked slugs (chips)
   - SKU rotation map: per product slug → `{ code, displayName, cas, noSizePrefix }`

3. **Product list** with per-row inline editor
   - Search box, "show only included" filter
   - Per row: include-in-this-feed toggle, override title, override description, override price, override image, override MPN/GTIN, custom_label_0..4, availability
   - "Reset to default" button per field (clears override → falls back to product/global default)

4. **Live diff preview** (reuses `MerchantFeedPreview` shape)
   - Before (last saved) vs After (current edits) per field
   - Char counts + Google range warnings
   - Banned-token scanner highlights problems before save

5. **Actions bar**
   - Save (writes Firestore docs in one batch + audit log)
   - Validate (runs `validateMerchantFeedAdmin` against the would-be feed)
   - Open live feed URL · Copy URL · Force re-fetch
   - Diff against saved (sticky banner showing N changed fields)

## Data model (Firestore)

```
/merchantFeedConfig/{feedKey}                           feedKey ∈ {phlabs_paid, phlabs_free, prohealth_paid, prohealth_free}
  channel, baseUrl, brand, currency, categoryId, categoryPath,
  productType, condition, identifierExists, ageGroup, adult,
  titleTemplate, descriptionTemplate, disclaimers,
  promoIds[], shipping{country,service,price}, cacheTtl,
  bannedTokens[], hardBlockedSlugs[], skuOverrides{slug:{code,displayName,cas,noSizePrefix}},
  updatedAt, updatedBy

/merchantFeedOverrides/{feedKey}/items/{productId}
  included, title?, description?, price?, image?, mpn?, gtin?,
  customLabel0?..customLabel4?, availability?, updatedAt
```

Default seeded from the current code values on first read so nothing breaks.

## Server changes (4 feed routes)

- New helper `src/lib/merchant-feed-config.ts` (server) — `loadFeedConfig(feedKey)` + `loadFeedOverrides(feedKey)` (Firestore REST, cached 30 s in-memory per worker).
- Refactor `google-merchant-feed[.]xml.ts` and `google-merchant-feed-free[.]xml.ts` to call `renderFeed(feedKey, host)` from a shared `src/lib/merchant-feed-render.ts`. The hard-coded `HIGH_RISK_TOKENS`, `MERCHANT_CODE_OVERRIDES`, `HARD_BLOCKED_SLUGS`, promo IDs, brand, base URL, category all read from the loaded config.
- Add new routes:
  - `src/routes/google-merchant-feed[.]xml.ts` becomes host-aware (chooses `phlabs_paid` vs `prohealth_paid` from request host) — no second route file needed because the existing one already serves both hosts via the proxy/worker.
  - `src/routes/google-merchant-feed-free[.]xml.ts` becomes host-aware (`phlabs_free` vs `prohealth_free`).
  - Prohealth gets its own canonical/link rendering (no proxy text rewrite) when the request host matches.

## Server functions

`src/lib/merchant-feed-admin.functions.ts` (auth-gated, admin-only):
- `getFeedConfig({ feedKey })`
- `saveFeedConfig({ feedKey, patch })`
- `getFeedOverrides({ feedKey })`
- `saveProductOverride({ feedKey, productId, patch })`
- `bulkToggleInclusion({ feedKey, productIds, included })`
- `previewFeedEntry({ feedKey, productId })` — returns the would-be `<item>` block + warnings

All guarded by `requireSupabaseAuth` + admin role check (same pattern as other admin write fns). Every save writes to `/auditLogs`.

## Wiring

- Register tab in `src/pages/Admin/index.tsx` (new entry `merchantfeededitor`, sit it next to the existing `MerchantFeedTab`).
- IndexNow ping on save (re-use existing helper).
- Existing `MerchantFeedTab` stays as the "status / validate / download" view; the new tab is the "edit everything" view.

## Out of scope (this round)

- No schema change for products themselves — overrides live in a separate collection so the product editor is untouched.
- No automated promo-ID sync to Google Merchant Center (still manual in GMC UI).
- No new feeds beyond the 4 listed.

## Deliverables checklist

- [ ] `src/lib/merchant-feed-config.ts` (server loader + defaults)
- [ ] `src/lib/merchant-feed-render.ts` (shared XML builder, config-driven)
- [ ] `src/lib/merchant-feed-admin.functions.ts` (admin RPCs)
- [ ] `src/routes/google-merchant-feed[.]xml.ts` refactor (host-aware)
- [ ] `src/routes/google-merchant-feed-free[.]xml.ts` refactor (host-aware)
- [ ] `src/pages/Admin/tabs/MerchantFeedEditorTab.tsx` (UI)
- [ ] Admin index registration
- [ ] One Firestore seed write per feedKey on first load
- [ ] Smoke: hit all 4 feed URLs, verify XML + cache headers + canonicals point at correct host

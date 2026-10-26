# Offline conversions: accept gbraid / wbraid

## What changes
Paid orders whose ad click came from iPhone/Safari (only `gbraid` or `wbraid`, no `gclid`) are currently skipped by the daily Google Ads file. After this change they are included.

## Edits (only `src/routes/api/public/hooks/offline-conversions.ts`, plus one new test)
1. Add an exported helper `pickAdClickId(clickIds)`:
   - checks `gclid`, then `gbraid`, then `wbraid`;
   - returns the first value that is a string and matches `/^[A-Za-z0-9_.\-~]{10,500}$/` (same pattern as `src/lib/gclid-capture.ts`);
   - returns `""` when none qualify.
2. Replace lines ~217-221 (`const gclid = ...; if (!gclid) continue;`) with `const clickId = pickAdClickId(...)`; `if (!clickId) continue;`, and use `clickId` in the "Google Click ID" cell (line ~239).
3. Header comment line 18: "has a captured ad click id (gclid, gbraid or wbraid — the first available, in that order)".

Note: the export currently has no regex check on gclid at all; applying the pattern is new validation (as requested). A malformed gclid will now fall through to gbraid/wbraid or skip the order.

## Untouched
48h rule (MIN_AGE_MS), Order ID dedup/column, GBP, conversion action name, CRON_SECRET auth, Europe/London time, ELIGIBLE_PROVIDERS, browser tracking, payments, Google Ads, the `.csv` alias route (reuses the same function).

## Tests
No existing tests cover this endpoint. Add `tests/offline-conversions-click-id.test.ts` for `pickAdClickId`:
- only `wbraid` → returns wbraid (order exported);
- only `gbraid` → returns gbraid;
- `gclid` + `wbraid` → gclid wins;
- no ids / junk values → `""` (order skipped).

## Verification
Run `tsgo` typecheck (project equivalent of tsc --noEmit), the new test and the existing vitest suite; report changed line counts per file.

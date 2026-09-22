# Ads point 6: remove the two equipment-flavoured headlines from ad group "PH"

## What I found (read-only check, just now)

I listed every text slot in the ad group "PH" — 13 short headlines, 3 long headlines, 6 descriptions, all active. Both texts you named are still live, and both sit in the short-headline slot only:

- "Premium Analytical Instruments" — short headline, active
- "Independent Laboratories" — short headline, active

Neither appears in the long headlines or the descriptions, and neither appears in any other ad group in the account. So nothing was re-created by Google's review — they were simply never removed.

## What I will change

One single change, approved by you on one card, removing exactly those two headlines from ad group "PH".

Nothing else in Google Ads is touched: budget, bidding, targeting, product feed, negatives, placements, the other ad groups, images, logos, business name, descriptions and long headlines all stay exactly as they are. No website change.

After the removal, "PH" keeps 11 short headlines — comfortably above Google's minimum of 3, so the ad keeps serving without a rebuild.

Remaining headlines after the change:
Research Peptides UK · HPLC-Verified Purity · Purity Verified By HPLC · Next Day Delivery Available · Independent Lab Analysis · RUO Compounds UK Stock · Batch-Tested Compounds · Lab-Grade Research Supply · UK Stock, Fast Dispatch · COA For Every Batch · Research Use Only Supply

## Verification

Straight after the change I re-read the same slots and confirm both texts are gone. If either is still returned, I remove it again and report the result rather than assuming it worked.

I will also note whether these two ever reappeared, so if Google does re-inject them later we know to check again after the next review pass.

## Technical notes

- Account "Ph Labs" (GBP), asset group "PH" (id 6733075399).
- Two `assetGroupAssetOperation` removes in one atomic mutate call:
  - `customers/4410206709/assetGroupAssets/6733075399~397975467728~HEADLINE`
  - `customers/4410206709/assetGroupAssets/6733075399~397975467722~HEADLINE`
- Verification re-runs the same `asset_group_asset` read filtered to field types HEADLINE, LONG_HEADLINE, DESCRIPTION with status != REMOVED.

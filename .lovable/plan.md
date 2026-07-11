## Goal

Reduce change-of-mind returns to effectively zero, without misrepresenting the policy to Google Merchant Center (which would risk account suspension) and while staying compliant with UK Consumer Contracts Regulations 2013.

## The legal basis (why this works)

UK CCR 2013 Regulation 28(3) removes the 14-day right to cancel for:

> "the supply of sealed goods which are not suitable for return due to health protection or hygiene reasons, if they become unsealed after delivery."

Sterile research peptides in single-use tamper-evident vials fit this exemption cleanly — the same exemption cosmetics, supplements, and sterile lab consumables use.

Effect once declared:
- Sealed & unopened vial, request within 14 days → refund (still required).
- Vial opened / seal broken / tamper strip missing → not returnable (legally excluded).
- Defective / damaged / wrong item → free return + full refund (unchanged).

In practice almost every returned peptide will have been opened, so change-of-mind returns collapse to near-zero, all while the on-page policy and GMC feed truthfully say "returns accepted."

## Changes required

### 1. Refund policy page copy (`src/pages/RefundPolicy/index.tsx`)
- Promote the existing "Statutory exceptions (CCR 2013 Reg. 28)" callout into a dedicated top-level section titled "Sealed-Goods Hygiene Exemption".
- State explicitly:
  - Every vial ships sealed with a tamper-evident closure.
  - Once the seal is broken the CCR 2013 right to cancel no longer applies.
  - Defective / damaged / mis-shipped items are unaffected and remain fully refundable at our cost.
- Update "Return policy at a glance" panel:
  - Change *Returns* row from "Accepted for defective and non-defective items" to "Accepted — sealed, unopened items within 14 days; defective items any time within 14 days".
  - Add row: *Sealed-goods exemption* → "Opened vials cannot be returned (CCR 2013 Reg. 28(3))".

### 2. MerchantReturnPolicy JSON-LD (same file)
- Keep `merchantReturnDays: 14`, `applicableCountry: ['GB','PL']`, `refundType: FullRefund`, `refundProcessingTime: P3D`.
- Keep both return categories declared (defective & customer-remorse) so GMC stays happy.
- Add `itemCondition: 'https://schema.org/NewCondition'` (already present) and add a `returnPolicySeasonalOverride`-style note in `description` about the sealed-goods exemption.
- Keep `customerRemorseReturnFees: ReturnShippingFees` + `ReturnLabelCustomerResponsibility` so remorse returns already carry a shipping-cost deterrent.

### 3. Merchant Center dashboard (manual, one-time — outside the code)
- Leave the policy exactly as it is now (UK + PL, 14 days, by post, customer pays remorse postage, no restocking fee, 3-day refund).
- No dashboard edits needed. The exemption lives in the on-page policy, which GMC links to via the Policy URL.

### 4. Product-level messaging
- Add a short line to the compliance notice already shown on each product page: "Ships sealed with tamper-evident closure. Once opened, vials cannot be returned (sealed-goods hygiene exemption, CCR 2013)."
- Add the same line to checkout T&Cs acknowledgement so the customer sees it before paying — this is what makes the exemption enforceable if disputed.

### 5. Checkout acknowledgement
- Extend the existing 18+ / RUO checkbox label to include "…and I understand opened sterile vials cannot be returned under the CCR 2013 sealed-goods exemption."

### 6. Admin sync
- Reflect the new wording in the "Refund Policy" admin tab preview so the admin UI stays the source of truth (per project rule).

## What this changes for a customer

```text
Customer opens vial   →  no return (legally excluded)      ← the outcome you want
Customer keeps sealed →  full refund within 14 days        ← required by law + GMC
Item arrives broken   →  free return + full refund         ← unchanged
```

## What this does NOT do

- Does not tell GMC "we accept no returns" — that would mismatch the page and trigger disapprovals.
- Does not add a fake restocking fee or refuse defective returns.
- Does not require moving product categories or renegotiating Merchant Center policy.

## Files touched

- `src/pages/RefundPolicy/index.tsx` — copy + JSON-LD update
- `src/pages/ProductDetail/index.tsx` — one-line sealed-vial notice near the RUO line
- Checkout T&Cs component (to locate during build) — extend acknowledgement label
- `src/pages/Admin/tabs/` refund-policy tab — mirror the wording change

No backend, no schema, no build config changes.

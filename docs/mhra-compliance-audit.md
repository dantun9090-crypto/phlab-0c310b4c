# MHRA / UK research-compliance audit

Generated: 2026-09-14T20:28:00.301Z
Origin audited: http://localhost:8080
Surfaces: 43 routes, 60 product/detail URLs, 4 feeds, email templates, gates.

## Summary

- Must fix: **81**
- Needs review: **5**
- Checks passed: **104**

## /bing-feed.xml

- **FAIL** (feed content) — Therapeutic claim: anti-inflammatory — "anti-inflammatory"
  - context: `…</url> <url> <loc>https://phlabs.co.uk/resources/kpv-tripeptide-anti-inflammatory-research</loc> <changefreq>monthly</changefreq> <priority>0.6…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **REVIEW** (feed) — no research-only wording in feed descriptions
  - fix: Append "For Research Use Only. Not for Human Consumption." to each feed description.

## /checkout/cancel

- **FAIL** (research-only notice) — no research-use-only / not-for-human-consumption notice in the rendered page
  - fix: Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.

## /checkout/cancelled

- **FAIL** (research-only notice) — no research-use-only / not-for-human-consumption notice in the rendered page
  - fix: Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.

## /checkout/success

- **FAIL** (research-only notice) — no research-use-only / not-for-human-consumption notice in the rendered page
  - fix: Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.

## /compare/bpc-157-vs-ghk-cu

- **FAIL** (page copy) — Implies cosmetic product — "cosmetic"
  - context: `…try — copper complex rather than a chain peptide ✓ Frequently used in cosmetic-chemistry and skin-fibroblast studies ✓ Lyophilised vials; reconstitu…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compare/bpc-157-vs-tb-500

- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…. Both appear together in comparative in-vitro studies. Are they sold for human use? + No. PH Labs supplies both strictly . . Related comparisons GHK-C…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…rative in-vitro studies."}},{"@type":"Question","name":"Are they sold for human use?","acceptedAnswer":{"@type":"Answer","text":"No. PH Labs supplies bot…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compare/ghk-cu-vs-bpc-157

- **FAIL** (page copy) — Implies cosmetic product — "cosmetic"
  - context: `…try — copper complex rather than a chain peptide ✓ Frequently used in cosmetic-chemistry and skin-fibroblast studies ✓ Lyophilised vials; reconstitu…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compare/retatrutide-vs-tirzepatide

- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…receptor target. This page covers the laboratory characteristics, not therapeutic claims. Retatrutide GLP-1 / GIP / glucagon triple agonist (research) …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…search masses to suit different in-vitro study designs. Are they sold for human use? + No. Both are supplied strictly . . Related comparisons Retatruti…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `… in-vitro study designs."}},{"@type":"Question","name":"Are they sold for human use?","acceptedAnswer":{"@type":"Answer","text":"No. Both are supplied st…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compare/tb-500-vs-ghk-cu

- **FAIL** (page copy) — Implies cosmetic product — "cosmetic"
  - context: `…try — copper complex rather than a chain peptide ✓ Frequently used in cosmetic-chemistry and skin-fibroblast studies ✓ Lyophilised vials; reconstitu…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compound

- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…l studies."}},{"@type":"Question","name":"Are these products intended for human use?","acceptedAnswer":{"@type":"Answer","text":"No. All materials are in…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /contact

- **REVIEW** (research-only notice) — the research-only banner is suppressed on the contact page
  - fix: Show the notice on every page, including contact.

## /google-ads-safe-feed.xml

- **FAIL** (feed content) — Safety claim — "Safe for"
  - context: `…o.uk</link> <description>Non-restricted laboratory reagents only. Safe for Google Ads / Shopping.</description> <!-- google_product_category…`
  - fix: Remove any statement implying the compound is safe.

## /google-merchant-feed-free.xml

- **FAIL** (feed content) — Implies therapeutic use — "therapeutic"
  - context: `… Strictly for in-vitro scientific testing and reference standards. , therapeutic or diagnostic use.]]></description> <g:image_link>https://firebas…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /google-merchant-feed.xml

- **REVIEW** (feed) — no research-only wording in feed descriptions
  - fix: Append "For Research Use Only. Not for Human Consumption." to each feed description.

## /landingad

- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…l studies."}},{"@type":"Question","name":"Are these products intended for human use?","acceptedAnswer":{"@type":"Answer","text":"No. All materials are in…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /mcp

- **REVIEW** (reachability) — HTTP 401

## /order/cancel

- **FAIL** (research-only notice) — no research-use-only / not-for-human-consumption notice in the rendered page
  - fix: Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.

## /order/cancelled

- **FAIL** (research-only notice) — no research-use-only / not-for-human-consumption notice in the rendered page
  - fix: Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.

## /order/success

- **FAIL** (research-only notice) — no research-use-only / not-for-human-consumption notice in the rendered page
  - fix: Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.

## /payment/cancel

- **FAIL** (research-only notice) — no research-use-only / not-for-human-consumption notice in the rendered page
  - fix: Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.

## /payment/success

- **FAIL** (research-only notice) — no research-use-only / not-for-human-consumption notice in the rendered page
  - fix: Render "For Research Use Only. Not for Human Consumption." in a non-dismissible position on this page.

## /research/bpc-157-tb-500-synergy

- **FAIL** (page copy) — Implies therapeutic use — "Therapy"
  - context: `…s Sikiric P. et al. (2018). Stable gastric pentadecapeptide BPC 157 — Therapy effect and mechanism review. Curr Pharm Des. doi: 10.2174/13816128246…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Therapeutic claim: wound healing — "wound-healing"
  - context: `…tration. Together they cover the two dominant preclinical readouts in wound-healing research. . . At a glance — combined panel design BPC-157 — angioge…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Therapeutic claim: healing — "healing"
  - context: `…n. Together they cover the two dominant preclinical readouts in wound-healing research. . . At a glance — combined panel design BPC-157 — angioge…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…the UK? No. Neither compound is approved by the , EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…tion before adding the test compound. Are BPC-157 and TB-500 approved for human use in the UK? No. Neither compound is approved by the , EMA or FDA for …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…"text":"No. Neither compound is approved by the , EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…pound."}},{"@type":"Question","name":"Are BPC-157 and TB-500 approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. Neither co…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/bpc-157-uk

- **FAIL** (page copy) — Implies therapeutic use — "Therapy"
  - context: `…s Sikiric P. et al. (2018). Stable gastric pentadecapeptide BPC 157 — Therapy effect and mechanism review. Curr Pharm Des. doi: 10.2174/13816128246…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Therapeutic claim: wound healing — "wound-healing"
  - context: `…and tissue-repair in-vitro panels in UK research laboratories. Within wound-healing and angiogenesis research, BPC-157 is used alongside TB-500 as an ort…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Therapeutic claim: healing — "healing"
  - context: `…ssue-repair in-vitro panels in UK research laboratories. Within wound-healing and angiogenesis research, BPC-157 is used alongside TB-500 as an ort…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…tigational compound. It is not approved by the , EMA, or FDA for any therapeutic indication. PH Labs supplies it strictly as a reference material for …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…and VEGFR2 contributions to the BPC-157 response. Is BPC-157 approved for human use? No. BPC-157 is an investigational compound. It is not approved by th…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…tigational compound. It is not approved by the , EMA, or FDA for any therapeutic indication. PH Labs supplies it strictly as a reference material for …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `… BPC-157 response."}},{"@type":"Question","name":"Is BPC-157 approved for human use?","acceptedAnswer":{"@type":"Answer","text":"No. BPC-157 is an invest…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/bpc-157-vs-tb-500

- **FAIL** (page copy) — Implies therapeutic use — "Therapy"
  - context: `…s Sikiric P. et al. (2018). Stable gastric pentadecapeptide BPC 157 — Therapy effect and mechanism review. Curr Pharm Des. doi: 10.2174/13816128246…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Therapeutic claim: wound healing — "wound-healing"
  - context: `…n and cytoskeletal remodelling. The two act on orthogonal arms of the wound-healing cascade in preclinical models. Which compound is the better reference…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Therapeutic claim: healing — "healing"
  - context: `…cytoskeletal remodelling. The two act on orthogonal arms of the wound-healing cascade in preclinical models. Which compound is the better reference…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Therapeutic claim: anti-inflammatory — "anti-inflammatory"
  - context: `…on-dependent effects. Downstream, TB-500 also produces angiogenic and anti-inflammatory outputs in preclinical models, but these are typically interpreted as…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…. Neither BPC-157 nor TB-500 is approved by the , EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…e aliquots to minimise proteolytic loss. Are either compound approved for human use in the UK? No. Neither BPC-157 nor TB-500 is approved by the , EMA o…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Therapeutic claim: wound healing — "wound-healing"
  - context: `…n and cytoskeletal remodelling. The two act on orthogonal arms of the wound-healing cascade in preclinical models."}},{"@type":"Question","name":"Which c…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (structured data) — Therapeutic claim: healing — "healing"
  - context: `…cytoskeletal remodelling. The two act on orthogonal arms of the wound-healing cascade in preclinical models."}},{"@type":"Question","name":"Which c…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…. Neither BPC-157 nor TB-500 is approved by the , EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…tic loss."}},{"@type":"Question","name":"Are either compound approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. Neither BP…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/cjc-1295-ipamorelin-synergy

- **FAIL** (page copy) — Implies medicinal product — "Drug"
  - context: `… four stabilising substitutions. &#x27;CJC-1295 with DAC&#x27; adds a Drug Affinity Complex (a maleimidopropionic-acid linker) that covalently b…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…the UK? No. Neither compound is approved by the , EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `… its albumin-bound pharmacology. Are CJC-1295 and Ipamorelin approved for human use in the UK? No. Neither compound is approved by the , EMA or FDA for …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies medicinal product — "Drug"
  - context: `…gment with four stabilising substitutions. 'CJC-1295 with DAC' adds a Drug Affinity Complex (a maleimidopropionic-acid linker) that covalently b…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…"text":"No. Neither compound is approved by the , EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…."}},{"@type":"Question","name":"Are CJC-1295 and Ipamorelin approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. Neither co…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/ghk-cu-guide

- **FAIL** (page copy) — Forbidden — not for human use — "human consumption"
  - context: `…-vitro research and analytical use. It is and is not authorised for human consumption or clinical application. References Pickart L. & Thaler M.M. (1973). …`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies clinical use — "clinical"
  - context: `…nalytical use. It is and is not authorised for human consumption or clinical application. References Pickart L. & Thaler M.M. (1973). Tripeptide i…`
  - fix: Replace "clinical" with "published study" or "laboratory".
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…ped with a batch-specific Certificate of Analysis. Is GHK-Cu approved for human use? No. PH Labs supplies GHK-Cu strictly as a reference material for in-…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…-vitro research and analytical use. It is and is not authorised for human consumption or clinical application."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies clinical use — "clinical"
  - context: `…nalytical use. It is and is not authorised for human consumption or clinical application."}}]}…`
  - fix: Replace "clinical" with "published study" or "laboratory".
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…ficate of Analysis."}},{"@type":"Question","name":"Is GHK-Cu approved for human use?","acceptedAnswer":{"@type":"Answer","text":"No. PH Labs supplies GHK…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/pt-141-uk

- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…man use in the UK? No. PT-141 is not approved by the or EMA for any therapeutic indication in the UK. PH Labs supplies it strictly as a reference mat…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `… reference compound in metabolic-stability panels. Is PT-141 approved for human use in the UK? No. PT-141 is not approved by the or EMA for any therape…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…":"Answer","text":"No. PT-141 is not approved by the or EMA for any therapeutic indication in the UK. PH Labs supplies it strictly as a reference mat…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…c-stability panels."}},{"@type":"Question","name":"Is PT-141 approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. PT-141 is …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/retatrutide-comprehensive-guide

- **FAIL** (page copy) — Weight-loss adjacent claim — "lipolysis"
  - context: `…ulation in transfected CHO-K1 lines is the primary readout; adipocyte lipolysis and β-cell insulin secretion are the mechanistic endpoints of interes…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Weight-loss adjacent claim — "adipocyte"
  - context: `…in-secretion models (INS-1 832/3, MIN6). GIPR — expressed on β-cells, adipocytes, and osteoclasts. In-vitro cAMP accumulation in transfected CHO-K1 l…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Drug-style efficacy claim — "efficacy"
  - context: `…-4 resistance, albumin binding, and preservation of glucagon-receptor efficacy that native GLP-1-family peptides lose during optimisation. 2. Triple…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…ith a batch-specific Certificate of Analysis. Is retatrutide approved for human use? No. Retatrutide is an investigational compound. PH Labs supplies it …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…e of Analysis."}},{"@type":"Question","name":"Is retatrutide approved for human use?","acceptedAnswer":{"@type":"Answer","text":"No. Retatrutide is an in…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/retatrutide-uk

- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…ss DPP-4 cleavage in plasma-stability assays. Is retatrutide approved for human use? No. Retatrutide is an investigational compound. PH Labs supplies it …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…bility assays."}},{"@type":"Question","name":"Is retatrutide approved for human use?","acceptedAnswer":{"@type":"Answer","text":"No. Retatrutide is an in…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/tirzepatide-vs-retatrutide

- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…tirzepatide nor retatrutide is approved by the , EMA, or FDA for any therapeutic indication in the context of reference-material supply. PH Labs suppl…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…xtended in-vitro pharmacokinetic models. Are either compound approved for human use in the UK? No. Neither tirzepatide nor retatrutide is approved by the…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…tirzepatide nor retatrutide is approved by the , EMA, or FDA for any therapeutic indication in the context of reference-material supply. PH Labs suppl…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…c models."}},{"@type":"Question","name":"Are either compound approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. Neither ti…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /resources/kpv-tripeptide-anti-inflammatory-research

- **FAIL** (page copy) — Therapeutic claim: anti-inflammatory — "Anti Inflammatory"
  - context: `Kpv Tripeptide Anti Inflammatory Research — Resource | PH… UK Laboratory Reagent Supplier · Pro Pept…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page title) — Therapeutic claim: anti-inflammatory — "Anti Inflammatory"
  - context: `Kpv Tripeptide Anti Inflammatory Research — Resource | PH……`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (meta description) — Therapeutic claim: anti-inflammatory — "Anti Inflammatory"
  - context: `Kpv Tripeptide Anti Inflammatory Research: resource notes and references from PH Labs UK.…`
  - fix: Remove; state only that the compound is supplied for laboratory research.

## /uk-research-store

- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…vice. Discreet, unbranded outer packaging. Are the materials intended for human use? + No. All items listed are strictly and are not intended for human…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `… packaging."}},{"@type":"Question","name":"Are the materials intended for human use?","acceptedAnswer":{"@type":"Answer","text":"No. All items listed are…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## email:adminInvoiceEmail.ts

- **FAIL** (research-only notice) — customer-facing email has no research-only notice
  - fix: Add "For Research Use Only. Not for Human Consumption." to the email footer.

## email:paymentConfirmedEmail.ts

- **FAIL** (research-only notice) — customer-facing email has no research-only notice
  - fix: Add "For Research Use Only. Not for Human Consumption." to the email footer.

## footer notice

- **FAIL** (notice persistence) — the footer research/MHRA disclaimer can be switched off from a site setting
  - fix: Remove the toggle so the footer notice is always rendered.

## site-wide notice

- **FAIL** (notice persistence) — the research-only banner can be permanently dismissed and is then never shown again
  - fix: Make the banner non-dismissible, or keep a permanent research-only line in the header/footer that cannot be hidden.
- **REVIEW** (notice wording) — banner reads "For Laboratory Research Only — Not for Human Consumption"; the mandated wording is "For Research Use Only. Not for Human Consumption."
  - fix: Use the exact mandated sentence.

## Passed checks

- / — research-only notice present
- /about — research-only notice present
- /account — research-only notice present
- /compare/bpc-157-vs-ghk-cu — research-only notice present
- /compare/bpc-157-vs-tb-500 — research-only notice present
- /compare/ghk-cu-vs-bpc-157 — research-only notice present
- /compare/klow-vs-glow — research-only notice present
- /compare/kpv-vs-bpc-157 — research-only notice present
- /compare/mots-c-vs-nad-plus — research-only notice present
- /compare/pt-141-vs-melanotan-2 — research-only notice present
- /compare/retatrutide-vs-tirzepatide — research-only notice present
- /compare/tb-500-vs-ghk-cu — research-only notice present
- /compound — research-only notice present
- /cookies — research-only notice present
- /downloads — research-only notice present
- /google-ads-safe-feed.xml — product category is non-medicinal
- /google-ads-safe-feed.xml — research-only wording present
- /google-merchant-feed-free.xml — product category is non-medicinal
- /google-merchant-feed-free.xml — research-only wording present
- /google-merchant-feed.xml — product category is non-medicinal
- /lab-reports — research-only notice present
- /landing/phlabs — research-only notice present
- /landingad — research-only notice present
- /privacy-policy — research-only notice present
- /privacy-requests — research-only notice present
- /products — research-only notice present
- /products/bacteriostatic-water-research-compound — research-only notice present
- /products/bpc-157 — research-only notice present
- /products/ghk-cu-research-peptide — research-only notice present
- /products/glow-blend — research-only notice present
- /products/klow-blend — research-only notice present
- /products/kpv-research-peptide — research-only notice present
- /products/melanotan-ii-research-peptide — research-only notice present
- /products/mots-c-research-peptide — research-only notice present
- /products/nad-research-compound — research-only notice present
- /products/pt-141-research — research-only notice present
- /products/r3tatrutid3 — research-only notice present
- /products/retatrutide-research-peptide — research-only notice present
- /products/tb-500-thymosin-beta-4 — research-only notice present
- /products/tirzepatide-research-peptide — research-only notice present
- /quality-control — research-only notice present
- /refund-policy — research-only notice present
- /request-catalog — research-only notice present
- /research — research-only notice present
- /research/bpc-157-tb-500-synergy — research-only notice present
- /research/bpc-157-uk — research-only notice present
- /research/bpc-157-vs-tb-500 — research-only notice present
- /research/cjc-1295-ipamorelin-synergy — research-only notice present
- /research/ghk-cu-guide — research-only notice present
- /research/pt-141-uk — research-only notice present
- /research/retatrutide-comprehensive-guide — research-only notice present
- /research/retatrutide-uk — research-only notice present
- /research/tirzepatide-vs-retatrutide — research-only notice present
- /resources — research-only notice present
- /resources/bpc-157-tissue-repair — research-only notice present
- /resources/bpc-157-vs-tb-500 — research-only notice present
- /resources/bpc-157-vs-tb-500-comparison — research-only notice present
- /resources/cjc-1295-mod-grf-ghrh-research — research-only notice present
- /resources/complete-uk-peptide-guide-2025 — research-only notice present
- /resources/epithalon-telomere-epigenetic-research — research-only notice present
- /resources/epithalon-telomere-research — research-only notice present
- /resources/follistatin-344-myostatin-inhibition-research — research-only notice present
- /resources/ghk-cu-copper-peptide-research — research-only notice present
- /resources/ghk-cu-research-guide — research-only notice present
- /resources/glow-blend-skin-peptide-research — research-only notice present
- /resources/how-to-read-hplc-certificate-of-analysis — research-only notice present
- /resources/hplc-testing-explained — research-only notice present
- /resources/ipamorelin-ghrp-research — research-only notice present
- /resources/klow-blend-cognitive-research — research-only notice present
- /resources/kpv-tripeptide-anti-inflammatory-research — research-only notice present
- /resources/mass-spectrometry-peptide-identity-verification — research-only notice present
- /resources/melanotan-2-melanocortin-research — research-only notice present
- /resources/mots-c-mitochondrial-derived-peptide — research-only notice present
- /resources/nad-nicotinamide-adenine-dinucleotide-research — research-only notice present
- /resources/peptide-categories-uk-research — research-only notice present
- /resources/peptide-reconstitution-guide — research-only notice present
- /resources/peptide-safety-legality-uk — research-only notice present
- /resources/peptide-storage-lyophilisation-science — research-only notice present
- /resources/peptide-storage-reconstitution — research-only notice present
- /resources/pt-141-bremelanotide-melanocortin-research — research-only notice present
- /resources/research-peptides-uk — research-only notice present
- /resources/retatrutide-research-guide — research-only notice present
- /resources/retatrutide-vs-tirzepatide-vs-semaglutide — research-only notice present
- /resources/selank-anxiolytic-nootropic-peptide — research-only notice present
- /resources/semax-cognitive-neuroprotective-research — research-only notice present
- /resources/tb-500-thymosin-beta-4 — research-only notice present
- /resources/tb-500-thymosin-beta-4-research — research-only notice present
- /resources/tirzepatide-dual-agonist-research — research-only notice present
- /resources/tirzepatide-vs-retatrutide-mechanism — research-only notice present
- /resources/what-are-peptides — research-only notice present
- /resources/what-is-retatrutide — research-only notice present
- /search — research-only notice present
- /shipping-policy — research-only notice present
- /storage-guide — research-only notice present
- /terms-and-conditions — research-only notice present
- /uk-research-store — research-only notice present
- 18+ date-of-birth gate present (client)
- email:dispatchEmail.ts — research-only notice present
- email:orderReceivedEmail.ts — research-only notice present
- email:professionalInvoiceEmail.ts — research-only notice present
- email:protocolLibraryEmail.ts — research-only notice present
- email:welcomeEmail.ts — research-only notice present
- order creation validates age confirmation server-side
- research-use confirmation gate present

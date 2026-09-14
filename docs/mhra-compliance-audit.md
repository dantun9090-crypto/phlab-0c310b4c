# MHRA / UK research-compliance audit

Generated: 2026-09-14T20:27:00.424Z
Origin audited: http://localhost:8080
Surfaces: 43 routes, 60 product/detail URLs, 4 feeds, email templates, gates.

## Summary

- Must fix: **225**
- Needs review: **6**
- Checks passed: **103**

## /

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…, batch COAs and next-day UK dispatch. For research use only. Not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /about

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /account

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

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

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…u research vials All research products For Research Use Only. Not for Human Consumption. PH Labs supplies research compounds to UK laboratories only.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies cosmetic product — "cosmetic"
  - context: `…try — copper complex rather than a chain peptide ✓ Frequently used in cosmetic-chemistry and skin-fibroblast studies ✓ Lyophilised vials; reconstitu…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compare/bpc-157-vs-tb-500

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…? + No. PH Labs supplies both strictly For Research Use Only. Not for Human Consumption. Related comparisons GHK-Cu vs BPC-157 BPC-157 vs GHK-Cu TB-500 vs GH…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…. Both appear together in comparative in-vitro studies. Are they sold for human use? + No. PH Labs supplies both strictly For Research Use Only. Not for …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "Human Consumption"
  - context: `…t":"No. PH Labs supplies both strictly For Research Use Only. Not for Human Consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…rative in-vitro studies."}},{"@type":"Question","name":"Are they sold for human use?","acceptedAnswer":{"@type":"Answer","text":"No. PH Labs supplies bot…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compare/ghk-cu-vs-bpc-157

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…7 research vials All research products For Research Use Only. Not for Human Consumption. PH Labs supplies research compounds to UK laboratories only.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies cosmetic product — "cosmetic"
  - context: `…try — copper complex rather than a chain peptide ✓ Frequently used in cosmetic-chemistry and skin-fibroblast studies ✓ Lyophilised vials; reconstitu…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compare/klow-vs-glow

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…d research vials All research products For Research Use Only. Not for Human Consumption. PH Labs supplies research compounds to UK laboratories only.…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /compare/kpv-vs-bpc-157

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…7 research vials All research products For Research Use Only. Not for Human Consumption. PH Labs supplies research compounds to UK laboratories only.…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /compare/mots-c-vs-nad-plus

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…+ research vials All research products For Research Use Only. Not for Human Consumption. PH Labs supplies research compounds to UK laboratories only.…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /compare/pt-141-vs-melanotan-2

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…I research vials All research products For Research Use Only. Not for Human Consumption. PH Labs supplies research compounds to UK laboratories only.…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /compare/retatrutide-vs-tirzepatide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `… use? + No. Both are supplied strictly For Research Use Only. Not for Human Consumption. Related comparisons Retatrutide vs MOTS-c Tirzepatide vs MOTS-c Reta…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…receptor target. This page covers the laboratory characteristics, not therapeutic claims. Retatrutide GLP-1 / GIP / glucagon triple agonist (research) …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…search masses to suit different in-vitro study designs. Are they sold for human use? + No. Both are supplied strictly For Research Use Only. Not for Huma…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "Human Consumption"
  - context: `…"text":"No. Both are supplied strictly For Research Use Only. Not for Human Consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `… in-vitro study designs."}},{"@type":"Question","name":"Are they sold for human use?","acceptedAnswer":{"@type":"Answer","text":"No. Both are supplied st…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compare/tb-500-vs-ghk-cu

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…u research vials All research products For Research Use Only. Not for Human Consumption. PH Labs supplies research compounds to UK laboratories only.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies cosmetic product — "cosmetic"
  - context: `…try — copper complex rather than a chain peptide ✓ Frequently used in cosmetic-chemistry and skin-fibroblast studies ✓ Lyophilised vials; reconstitu…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /compound

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…reagent grade PH Labs · United Kingdom For Research Use Only. Not for Human Consumption. EST. 2026 UK Laboratory Supply Premium Research Compounds for UK Lab…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…or laboratory and scientific research purposes. They are not intended for human use or for any non-research application. ” PH Labs · Research Standard § …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…l studies."}},{"@type":"Question","name":"Are these products intended for human use?","acceptedAnswer":{"@type":"Answer","text":"No. All materials are in…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /contact

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **REVIEW** (research-only notice) — the research-only banner is suppressed on the contact page
  - fix: Show the notice on every page, including contact.

## /cookies

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /downloads

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…eference PDFs for PH Labs researchers. For Research Use Only. Not for Human Consumption. PH Labs Research Catalogue Full product catalogue with COAs and tech…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /google-ads-safe-feed.xml

- **FAIL** (feed content) — Safety claim — "Safe for"
  - context: `…o.uk</link> <description>Non-restricted laboratory reagents only. Safe for Google Ads / Shopping.</description> <!-- google_product_category…`
  - fix: Remove any statement implying the compound is safe.

## /google-merchant-feed-free.xml

- **FAIL** (feed content) — Forbidden — not for human use — "human consumption"
  - context: `…PLC ≥99% purity, CoA per batch, in-vitro laboratory use only. NOT for human consumption.</description> <item> <g:id>2s5IGEx2RgUDLfbfjBbF</g:id> <ti…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (feed content) — Implies therapeutic use — "therapeutic"
  - context: `…cientific testing and reference standards. NOT for human consumption, therapeutic or diagnostic use.]]></description> <g:image_link>https://firebas…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /google-merchant-feed.xml

- **REVIEW** (feed) — no research-only wording in feed descriptions
  - fix: Append "For Research Use Only. Not for Human Consumption." to each feed description.

## /install

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /lab-reports

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /landing/phlabs

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…wful. © 2026 PH Labs · United Kingdom For Research Use Only · Not for Human Consumption…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…on intent “ For laboratory and scientific research purposes only. Not for human use or for any non-research application. ” — PH Labs Editorial Standard O…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…l laboratories in the United Kingdom. For research use only — not for human consumption."}},{"@type":"Question","name":"Do you provide batch documentation?",…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /landingad

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…reagent grade PH Labs · United Kingdom For Research Use Only. Not for Human Consumption. EST. 2026 UK Laboratory Supply Premium Research Compounds for UK Lab…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…or laboratory and scientific research purposes. They are not intended for human use or for any non-research application. ” PH Labs · Research Standard § …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
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

## /privacy-policy

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /privacy-requests

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…rity, batch COAs and fast UK dispatch. For research use only. Not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/bacteriostatic-water-research-compound

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `… diluent for in-vitro reconstitution. For research use only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `… diluent for in-vitro reconstitution. For research use only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/bpc-157

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…batch Certificate of Analysis. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…batch Certificate of Analysis. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/ghk-cu-research-peptide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…9% purity, batch CoA included. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…9% purity, batch CoA included. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/glow-blend

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…ied components with batch CoA. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…ied components with batch CoA. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/klow-blend

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…ied components with batch CoA. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…ied components with batch CoA. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/kpv-research-peptide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…9% purity, batch CoA included. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…9% purity, batch CoA included. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/melanotan-ii-research-peptide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `… of Analysis included. For scientific research purposes only. Not for human consumption, not for veterinary use, not a cosmetic, not a dietary supplement, an…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies dietary supplement — "supplement"
  - context: `…an consumption, not for veterinary use, not a cosmetic, not a dietary supplement, and not a pharmaceutical or medical product.","image":"https://fireb…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies cosmetic product — "cosmetic"
  - context: `…rposes only. Not for human consumption, not for veterinary use, not a cosmetic, not a dietary supplement, and not a pharmaceutical or medical produc…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /products/mots-c-research-peptide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…, batch CoA included. For in-vitro laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…, batch CoA included. For in-vitro laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/nad-research-compound

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…ent. HPLC-verified, batch CoA. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…ent. HPLC-verified, batch CoA. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/pt-141-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…sis provided. Sold strictly for scientific research purposes. Not for human consumption, not for veterinary use, not a dietary supplement, and not a pharmace…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies dietary supplement — "supplement"
  - context: `…ses. Not for human consumption, not for veterinary use, not a dietary supplement, and not a pharmaceutical or medical product.","image":"https://fireb…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /products/r3tatrutid3

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/retatrutide-research-peptide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…9% purity, batch CoA included. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…9% purity, batch CoA included. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/tb-500-thymosin-beta-4

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…. HPLC ≥99% purity, batch CoA. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…. HPLC ≥99% purity, batch CoA. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /products/tirzepatide-research-peptide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (meta description) — Forbidden — not for human use — "human consumption"
  - context: `…9% purity, batch CoA included. For laboratory research only — not for human consumption.…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…9% purity, batch CoA included. For laboratory research only — not for human consumption.","image":"https://firebasestorage.googleapis.com/v0/b/prohealthpepti…`
  - fix: Delete; keep only the "not for human consumption" notice.

## /quality-control

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /refund-policy

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /request-catalog

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /research/bpc-157-tb-500-synergy

- **FAIL** (page copy) — Implies therapeutic use — "Therapy"
  - context: `…s Sikiric P. et al. (2018). Stable gastric pentadecapeptide BPC 157 — Therapy effect and mechanism review. Curr Pharm Des. doi: 10.2174/13816128246…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…al readouts in wound-healing research. For Research Use Only. Not for Human Consumption. At a glance — combined panel design BPC-157 — angiogenesis arm Pathw…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Therapeutic claim: wound healing — "wound-healing"
  - context: `…tration. Together they cover the two dominant preclinical readouts in wound-healing research. For Research Use Only. Not for Human Consumption. At a glan…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Therapeutic claim: healing — "healing"
  - context: `…n. Together they cover the two dominant preclinical readouts in wound-healing research. For Research Use Only. Not for Human Consumption. At a glan…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `… UK? No. Neither compound is approved by the MHRA, EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…tion before adding the test compound. Are BPC-157 and TB-500 approved for human use in the UK? No. Neither compound is approved by the MHRA, EMA or FDA f…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…in-vitro laboratory research and analytical characterisation. Not for human consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…xt":"No. Neither compound is approved by the MHRA, EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…pound."}},{"@type":"Question","name":"Are BPC-157 and TB-500 approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. Neither co…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/bpc-157-uk

- **FAIL** (page copy) — Implies therapeutic use — "Therapy"
  - context: `…s Sikiric P. et al. (2018). Stable gastric pentadecapeptide BPC 157 — Therapy effect and mechanism review. Curr Pharm Des. doi: 10.2174/13816128246…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…atch-specific Certificate of Analysis. For Research Use Only. Not for Human Consumption. At a glance Identifier BPC-157 / PL 14736 Class Pentadecapeptide (15…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Therapeutic claim: wound healing — "wound-healing"
  - context: `…and tissue-repair in-vitro panels in UK research laboratories. Within wound-healing and angiogenesis research, BPC-157 is used alongside TB-500 as an ort…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Therapeutic claim: healing — "healing"
  - context: `…ssue-repair in-vitro panels in UK research laboratories. Within wound-healing and angiogenesis research, BPC-157 is used alongside TB-500 as an ort…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…ational compound. It is not approved by the MHRA, EMA, or FDA for any therapeutic indication. PH Labs supplies it strictly as a reference material for …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…and VEGFR2 contributions to the BPC-157 response. Is BPC-157 approved for human use? No. BPC-157 is an investigational compound. It is not approved by th…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `… reference material for in-vitro research and analytical use. Not for human consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…ational compound. It is not approved by the MHRA, EMA, or FDA for any therapeutic indication. PH Labs supplies it strictly as a reference material for …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `… BPC-157 response."}},{"@type":"Question","name":"Is BPC-157 approved for human use?","acceptedAnswer":{"@type":"Answer","text":"No. BPC-157 is an invest…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/bpc-157-vs-tb-500

- **FAIL** (page copy) — Implies therapeutic use — "Therapy"
  - context: `…s Sikiric P. et al. (2018). Stable gastric pentadecapeptide BPC 157 — Therapy effect and mechanism review. Curr Pharm Des. doi: 10.2174/13816128246…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…igration and cytoskeletal remodelling. For Research Use Only. Not for Human Consumption. At a glance Attribute BPC-157 TB-500 Class Synthetic pentadecapeptid…`
  - fix: Delete; keep only the "not for human consumption" notice.
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
  - context: `…either BPC-157 nor TB-500 is approved by the MHRA, EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…e aliquots to minimise proteolytic loss. Are either compound approved for human use in the UK? No. Neither BPC-157 nor TB-500 is approved by the MHRA, EM…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…aterials for in-vitro laboratory research and analytical use. Not for human consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Therapeutic claim: wound healing — "wound-healing"
  - context: `…n and cytoskeletal remodelling. The two act on orthogonal arms of the wound-healing cascade in preclinical models."}},{"@type":"Question","name":"Which c…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (structured data) — Therapeutic claim: healing — "healing"
  - context: `…cytoskeletal remodelling. The two act on orthogonal arms of the wound-healing cascade in preclinical models."}},{"@type":"Question","name":"Which c…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…either BPC-157 nor TB-500 is approved by the MHRA, EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…tic loss."}},{"@type":"Question","name":"Are either compound approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. Neither BP…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/cjc-1295-ipamorelin-synergy

- **FAIL** (page copy) — Implies medicinal product — "Drug"
  - context: `… four stabilising substitutions. &#x27;CJC-1295 with DAC&#x27; adds a Drug Affinity Complex (a maleimidopropionic-acid linker) that covalently b…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `… in somatotroph secretagogue research. For Research Use Only. Not for Human Consumption. At a glance — combined panel design CJC-1295 — GHRH arm Receptor: GH…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `… UK? No. Neither compound is approved by the MHRA, EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `… its albumin-bound pharmacology. Are CJC-1295 and Ipamorelin approved for human use in the UK? No. Neither compound is approved by the MHRA, EMA or FDA f…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies medicinal product — "Drug"
  - context: `…gment with four stabilising substitutions. 'CJC-1295 with DAC' adds a Drug Affinity Complex (a maleimidopropionic-acid linker) that covalently b…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…in-vitro laboratory research and analytical characterisation. Not for human consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…xt":"No. Neither compound is approved by the MHRA, EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…."}},{"@type":"Question","name":"Are CJC-1295 and Ipamorelin approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. Neither co…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/ghk-cu-guide

- **FAIL** (page copy) — Implies medicinal product — "medicine"
  - context: `…erence material for in-vitro research and analytical use. It is not a medicine and is not authorised for human consumption or clinical application. …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…rises a GHK-Cu reference lot in-vitro. For Research Use Only. Not for Human Consumption. In this guide The molecule at a glance Copper(II) binding & coordina…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies clinical use — "clinical"
  - context: `…. It is not a medicine and is not authorised for human consumption or clinical application. References Pickart L. & Thaler M.M. (1973). Tripeptide i…`
  - fix: Replace "clinical" with "published study" or "laboratory".
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…ped with a batch-specific Certificate of Analysis. Is GHK-Cu approved for human use? No. PH Labs supplies GHK-Cu strictly as a reference material for in-…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies medicinal product — "medicine"
  - context: `…erence material for in-vitro research and analytical use. It is not a medicine and is not authorised for human consumption or clinical application."…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…ch and analytical use. It is not a medicine and is not authorised for human consumption or clinical application."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies clinical use — "clinical"
  - context: `…. It is not a medicine and is not authorised for human consumption or clinical application."}}]}…`
  - fix: Replace "clinical" with "published study" or "laboratory".
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…ficate of Analysis."}},{"@type":"Question","name":"Is GHK-Cu approved for human use?","acceptedAnswer":{"@type":"Answer","text":"No. PH Labs supplies GHK…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/pt-141-uk

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…atch-specific Certificate of Analysis. For Research Use Only. Not for Human Consumption. At a glance Identifier PT-141 / Bremelanotide Class Cyclic heptapept…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `… use in the UK? No. PT-141 is not approved by the MHRA or EMA for any therapeutic indication in the UK. PH Labs supplies it strictly as a reference mat…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `… reference compound in metabolic-stability panels. Is PT-141 approved for human use in the UK? No. PT-141 is not approved by the MHRA or EMA for any ther…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `… reference material for in-vitro research and analytical use. Not for human consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…Answer","text":"No. PT-141 is not approved by the MHRA or EMA for any therapeutic indication in the UK. PH Labs supplies it strictly as a reference mat…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…c-stability panels."}},{"@type":"Question","name":"Is PT-141 approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. PT-141 is …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/retatrutide-comprehensive-guide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…cterise it in the in-vitro laboratory. For Research Use Only. Not for Human Consumption. In this guide The molecule at a glance Triple-agonist mechanism of a…`
  - fix: Delete; keep only the "not for human consumption" notice.
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
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `… reference material for in-vitro research and analytical use. Not for human consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…e of Analysis."}},{"@type":"Question","name":"Is retatrutide approved for human use?","acceptedAnswer":{"@type":"Answer","text":"No. Retatrutide is an in…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/retatrutide-uk

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…atch-specific Certificate of Analysis. For Research Use Only. Not for Human Consumption. At a glance Identifier LY3437943 CAS 2381089-83-2 Molecular formula …`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…ss DPP-4 cleavage in plasma-stability assays. Is retatrutide approved for human use? No. Retatrutide is an investigational compound. PH Labs supplies it …`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `… reference material for in-vitro research and analytical use. Not for human consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…bility assays."}},{"@type":"Question","name":"Is retatrutide approved for human use?","acceptedAnswer":{"@type":"Answer","text":"No. Retatrutide is an in…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /research/tirzepatide-vs-retatrutide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…olic and receptor-pharmacology panels. For Research Use Only. Not for Human Consumption. At a glance Attribute Tirzepatide Retatrutide Receptor profile Dual …`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies therapeutic use — "therapeutic"
  - context: `…zepatide nor retatrutide is approved by the MHRA, EMA, or FDA for any therapeutic indication in the context of reference-material supply. PH Labs suppl…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…xtended in-vitro pharmacokinetic models. Are either compound approved for human use in the UK? No. Neither tirzepatide nor retatrutide is approved by the…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Forbidden — not for human use — "human consumption"
  - context: `…aterials for in-vitro laboratory research and analytical use. Not for human consumption."}}]}…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (structured data) — Implies therapeutic use — "therapeutic"
  - context: `…zepatide nor retatrutide is approved by the MHRA, EMA, or FDA for any therapeutic indication in the context of reference-material supply. PH Labs suppl…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `…c models."}},{"@type":"Question","name":"Are either compound approved for human use in the UK?","acceptedAnswer":{"@type":"Answer","text":"No. Neither ti…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## /resources

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/bpc-157-tissue-repair

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/bpc-157-vs-tb-500

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/bpc-157-vs-tb-500-comparison

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/cjc-1295-mod-grf-ghrh-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/complete-uk-peptide-guide-2025

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/epithalon-telomere-epigenetic-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/epithalon-telomere-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/follistatin-344-myostatin-inhibition-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/ghk-cu-copper-peptide-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/ghk-cu-research-guide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/glow-blend-skin-peptide-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/how-to-read-hplc-certificate-of-analysis

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/hplc-testing-explained

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/ipamorelin-ghrp-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/klow-blend-cognitive-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/kpv-tripeptide-anti-inflammatory-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Therapeutic claim: anti-inflammatory — "Anti Inflammatory"
  - context: `Kpv Tripeptide Anti Inflammatory Research — Resource | PH… UK Laboratory Reagent Supplier · Research U…`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (page title) — Therapeutic claim: anti-inflammatory — "Anti Inflammatory"
  - context: `Kpv Tripeptide Anti Inflammatory Research — Resource | PH……`
  - fix: Remove; state only that the compound is supplied for laboratory research.
- **FAIL** (meta description) — Therapeutic claim: anti-inflammatory — "Anti Inflammatory"
  - context: `Kpv Tripeptide Anti Inflammatory Research: resource notes and references from PH Labs UK.…`
  - fix: Remove; state only that the compound is supplied for laboratory research.

## /resources/mass-spectrometry-peptide-identity-verification

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/melanotan-2-melanocortin-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/mots-c-mitochondrial-derived-peptide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/nad-nicotinamide-adenine-dinucleotide-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/peptide-categories-uk-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/peptide-reconstitution-guide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/peptide-safety-legality-uk

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/peptide-storage-lyophilisation-science

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/peptide-storage-reconstitution

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/pt-141-bremelanotide-melanocortin-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/research-peptides-uk

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/retatrutide-research-guide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/retatrutide-vs-tirzepatide-vs-semaglutide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/selank-anxiolytic-nootropic-peptide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/semax-cognitive-neuroprotective-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/tb-500-thymosin-beta-4

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/tb-500-thymosin-beta-4-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/tirzepatide-dual-agonist-research

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/tirzepatide-vs-retatrutide-mechanism

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/what-are-peptides

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /resources/what-is-retatrutide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /search

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /shipping-policy

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /storage-guide

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /terms-and-conditions

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…Certificate of Analysis with every batch. Research Use Only — Not For Human Consumption. Loading PH Labs……`
  - fix: Delete; keep only the "not for human consumption" notice.

## /uk-research-store

- **FAIL** (page copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…b-Grade Reference Materials | PH Labs For Research Use Only · Not for Human Consumption · UK Laboratory Supply UK Research Store · PH Labs High-purity refere…`
  - fix: Delete; keep only the "not for human consumption" notice.
- **FAIL** (page copy) — Implies human use — "for human use"
  - context: `…vice. Discreet, unbranded outer packaging. Are the materials intended for human use? + No. All items listed are strictly For Research Use Only and are no…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.
- **FAIL** (structured data) — Implies human use — "for human use"
  - context: `… packaging."}},{"@type":"Question","name":"Are the materials intended for human use?","acceptedAnswer":{"@type":"Answer","text":"No. All items listed are…`
  - fix: Reword so the text describes laboratory research context only, with no outcome, health or medical framing.

## checkout

- **REVIEW** (18+ enforcement) — could not locate the order-creation endpoint to verify server-side 18+ enforcement

## email:adminInvoiceEmail.ts

- **FAIL** (research-only notice) — customer-facing email has no research-only notice
  - fix: Add "For Research Use Only. Not for Human Consumption." to the email footer.

## email:dispatchEmail.ts

- **FAIL** (email copy) — Forbidden — not for human use — "human consumption"
  - context: `…a><br> All products for research/laboratory use only. Not for human consumption. </p> </div> '; return emailWrapper(content, 'linear-g…`
  - fix: Delete; keep only the "not for human consumption" notice.

## email:emailBase.ts

- **FAIL** (email copy) — Forbidden — not for human use — "human consumption"
  - context: `…${C.textMuted};">research &amp; laboratory use only</strong>. Not for human consumption. </div> </td> </tr> …`
  - fix: Delete; keep only the "not for human consumption" notice.

## email:orderReceivedEmail.ts

- **FAIL** (email copy) — Forbidden — not for human use — "Human Consumption"
  - context: `…bs.co.uk</a>. <br /><br /> For Research Use Only. Not for Human Consumption. </p> '; const text = [ 'Order received — ${p.orderNumbe…`
  - fix: Delete; keep only the "not for human consumption" notice.

## email:orderStatusEmail.ts

- **FAIL** (email copy) — Forbidden — not for human use — "human consumption"
  - context: `…a><br> All products for research/laboratory use only. Not for human consumption. </p> </div> '; return emailWrapper(content, cfg.accen…`
  - fix: Delete; keep only the "not for human consumption" notice.

## email:paymentConfirmedEmail.ts

- **FAIL** (research-only notice) — customer-facing email has no research-only notice
  - fix: Add "For Research Use Only. Not for Human Consumption." to the email footer.

## email:professionalInvoiceEmail.ts

- **FAIL** (email copy) — Forbidden — not for human use — "human consumption"
  - context: `…rictly for <strong>research and laboratory use only</strong>. Not for human consumption. </p> <p style="color:#1a3a5c;font-size:10px;…`
  - fix: Delete; keep only the "not for human consumption" notice.

## email:welcomeEmail.ts

- **FAIL** (email copy) — Forbidden — not for human use — "human consumption"
  - context: `…or:${C.textMuted};">research purposes only</strong>. Not for human consumption. For laboratory use only.<br> Questions? <a href="mailto:info…`
  - fix: Delete; keep only the "not for human consumption" notice.

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
- research-use confirmation gate present

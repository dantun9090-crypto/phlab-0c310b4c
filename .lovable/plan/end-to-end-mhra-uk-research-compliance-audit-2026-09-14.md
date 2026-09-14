# End-to-end MHRA / UK research-compliance audit

Goal: check every page, email and product feed of phlabs.co.uk against the UK research-only rules (no medical claims, no human-use language, research-only notice always visible, 18+ gate) and produce a findings report before changing anything.

## What I already confirmed

- The three existing automated scans pass today, but they only cover a slice of the site: the Resources articles, the /compound landing page, and the Ads landing sources. Product pages, the research guides, category pages, policy pages, order emails and the Google/Bing product feeds are not scanned at all.
- The site-wide notice reads "For Laboratory Research Only — Not for Human Consumption" and can be permanently dismissed (stored in the browser), so returning visitors see no notice.
- The footer notice can be switched off from a site setting, and is hidden on the contact page.
- There is an 18+ date-of-birth gate and a research-use confirmation gate in place.

## Audit scope (report only, no site changes yet)

1. Every route rendered and checked for: the research-only notice present, no forbidden claim wording, no dosage/administration language, no disease or outcome claims.
2. Product titles, descriptions and variant copy taken from the live product records.
3. Search result snippets: page titles and descriptions for every route.
4. Structured data (product/article markup) checked for claim language and for correct non-medical product category.
5. Customer emails (order received, dispatch, payment, welcome, catalogue) checked with the same word list.
6. Google Merchant, Google Ads safe feed and Bing feed output checked for banned wording and correct category.
7. Downloadable catalogue PDF and lab-report pages checked.
8. Age gate and research gate checked end to end, including that the 18+ confirmation is enforced server-side at checkout.
9. Notice persistence checked: whether a visitor can permanently hide the research-only notice, and whether the footer notice can be switched off.

## Deliverable

A written report in chat plus `docs/mhra-compliance-audit.md` listing each finding as pass / fail / needs-wording-change, with the exact offending text and a compliant replacement suggested for each fail. No page copy, layout or design changes in this step.

## Follow-up step (only after you approve the findings)

- Apply the wording corrections you accept.
- Extend the automated scan to cover every route, product record, email template and feed, and wire it into the existing checks so future edits cannot reintroduce a claim.
- Reflect the compliance status in the admin panel so you can see it without asking.

## Technical notes

- Reuse the `FORBIDDEN_CLAIMS` list in `src/lib/peptide-compliance.ts` as the single word list, extended with the project's banned-token list from `scripts/landing-banned-tokens-scan.ts`.
- Route HTML is captured from the local dev server via Playwright so client-rendered copy is included, not just source text.
- Product/variant copy is read from Firestore with the existing admin service account (read-only).
- New audit script `scripts/mhra-audit.ts` writes both the markdown report and a JSON artifact; no existing scan scripts are modified in this step.

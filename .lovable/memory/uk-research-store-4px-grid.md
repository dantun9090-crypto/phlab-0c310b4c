---
name: 4px responsive spacing scale
description: Semantic 4px spacing tiers for /uk-research-store — allowed Tailwind tokens per breakpoint, tokens that are BANNED because they break the grid, and how mobile→desktop scaling is done
type: design
---

# 4px responsive spacing scale (`/uk-research-store`)

All paddings, margins, and gaps snap to a **4px grid** at every breakpoint.
The rules below apply to `src/routes/uk-research-store.tsx` and any new
section added to that page. Enforced by
`e2e/uk-research-store-visual.spec.ts` (grid-assertion test runs at both
mobile 400 and desktop 1280).

## Allowed Tailwind spacing tokens

Tailwind's default scale is `0.25rem = 4px`, so **integer** `p-*` / `m-*` /
`gap-*` tokens are automatically on-grid. Half-step tokens (`p-0.5`,
`p-1.5`, `p-2.5`, `p-3.5`) produce **2px / 6px / 10px / 14px** and MUST NOT
be used for layout spacing on this page.

Keep half-step tokens out of `padding`, `margin`, `gap`, `space-y-*`,
`space-x-*`, and `inset-*` on layout containers. They are fine on
purely-decorative sizing (icon dot `h-1.5 w-1.5`, hairline `h-px`).

## Semantic tiers (mobile → desktop pairs)

Use these responsive pairs so mobile and desktop stay in rhythm without
ever leaving the 4px grid:

| Tier          | Mobile          | Desktop (`md:`)  | Purpose                        |
|---------------|-----------------|------------------|--------------------------------|
| section-y     | `py-14` (56)    | `md:py-20` (80)  | Vertical padding of `<section>`|
| hero-y        | `pt-12 pb-14`   | `md:pt-20 md:pb-24` (80/96) | Hero only          |
| gutter-x      | `px-4` (16)     | `sm:px-6` (24)   | Horizontal page gutter         |
| card-inner    | `p-6` (24)      | `md:p-8` (32)    | Card interior padding          |
| stack-tight   | `gap-3` (12)    | —                | Icon+label rows, badges        |
| stack-normal  | `gap-6` (24)    | `md:gap-8` (32)  | Card/grid gaps                 |
| stack-loose   | `gap-10` (40)   | `lg:gap-12` (48) | Hero column gap                |
| cta-button    | `px-7 py-4`     | —                | Primary/secondary CTA          |
| header-mt     | `mt-6` (24)     | —                | First element after `<h*>`     |

Everything above is a multiple of 4. When a new spacing value is needed,
pick the next-nearest multiple of 4 — never introduce a `.5` token.

## Responsive scaling rule

- Spacing may only grow **up** at `sm:` / `md:` / `lg:` breakpoints (never
  shrink). Both the mobile value and the desktop value must be on the
  4px grid independently.
- Prefer the tiers above. If you need something custom, the allowed
  desktop bumps are `+8`, `+12`, `+16`, `+24` (all divisible by 4).
- Do NOT mix `py-3.5 md:py-5` (14→20, mobile off-grid) or `p-5 md:p-7`
  paired with `gap-3.5` etc.

## Banned tokens on this page

`p-0.5` `p-1.5` `p-2.5` `p-3.5` (and their `px-*` / `py-*` / `pt-*` / `pb-*`
/ `pl-*` / `pr-*` variants) — same for `m-*`, `mt-*`, `mb-*`, `ml-*`,
`mr-*`, `mx-*`, `my-*`, `gap-*`, `space-y-*`, `space-x-*`, `inset-*`,
`top-*`, `right-*`, `bottom-*`, `left-*`, `translate-x-*`, `translate-y-*`.

## Verification

Run before shipping any spacing change on this page:

```bash
bunx playwright test e2e/uk-research-store-visual.spec.ts --project=chromium
```

The `all paddings/margins/gaps snap to the 4px grid` test executes at
both 400×900 (mobile) and 1280×1800 (desktop). Any half-step token
produces a numeric px value like `14` or `6`, which fails the
`n % 4 === 0` assertion with the exact selector.

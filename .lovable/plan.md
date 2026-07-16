Before I start editing, I want to confirm scope — several items in this request either conflict with existing decisions in the codebase or need a clarification, and I don't want to break working flows in an emergency fix.

## What I'll do (safe, confirmed)

1. **Sticky banner vs menu z-index**
   - Audit banner component (`src/config/banner.config.ts` + wherever it renders) and confirm the header/nav sit above it. Header is already `z-[10020]`, mobile drawer at max int. If the banner is stealing clicks, add `pointer-events-none` to its decorative wrapper and keep only the CTA interactive, and cap banner at `z-30`.

2. **Manual Bank Transfer "infinite scroll"**
   - In `src/components/PaymentMethodOptions.tsx` remove any `scrollIntoView` / focus-scroll on selection. Render bank details inline in the accordion (already partially done in an earlier turn). Verify no `useEffect` re-scrolls when `selected` changes.

3. **Wallid "Pay by Bank" button not firing**
   - Add `[WALLID]` console logs at click / fetch / response.
   - Verify the button isn't disabled by form validation when Wallid is selected.
   - Confirm the `/api/payments/create` call path (which we hardened last turn) still returns 200 and redirects. If it fails, surface the server error to the toast instead of silently doing nothing.
   - No Wallid client-side SDK is used here — it's a server-created redirect link, so "missing Wallid script / merchant ID" doesn't apply. I'll note this in the fix.

4. **Typecheck + build verification** at the end.

## What I need to check with you before touching

5. **Admin gating by hard-coded email `dantun90@hotmail.com`**
   - Project rules (workspace knowledge, memory, Firestore rules) are explicit: **never gate admin by client-side checks, never trust client `isAdmin`, always enforce server-side via `customers/{uid}.isAdmin === true` + `has_role`**. Hard-coding an email in the client bundle is exactly the anti-pattern those rules forbid, and it will also fail server-side (Firestore rules check `isAdmin`, not email).
   - The correct fix is: ensure your `customers/{uid}` doc has `isAdmin: true` (it already does — you use it everywhere), and admin buttons render behind the existing `useIsAdmin()` / server `requireFirebaseAdmin` guard. If some admin button today renders for everyone, I'll wrap it in that existing guard.
   - **Please confirm:** proceed with the existing `isAdmin` guard (recommended, matches project rules) rather than an email hard-code?

6. **`/basket` route + Safari basket bug**
   - The site currently uses a slide-in cart drawer, not a dedicated page — that's an intentional UX choice, not a missing route. Adding a `/basket` page is a **new feature**, not a bug fix, and it touches routing, SEO (robots blocks `/cart`), and checkout flow. That's outside the "don't break working checkout" guardrail in your own prompt.
   - The Safari "variant errors / stuck basket" is a separate bug I can investigate against the drawer — likely a `localStorage` access under ITP/private mode or a stale variant slug in the persisted cart.
   - **Please pick one:**
     - (a) I only fix the Safari drawer bug (recommended, minimal risk), or
     - (b) I also add a new `/basket` route as an additional surface (bigger change, needs SEO + robots update).

## Not doing

- No product data, price, or Firestore collection changes.
- No redesign, no header/logo/nav reordering.
- No changes to Wallid webhook / signature / server secrets.

Reply with **"go, use isAdmin guard, Safari drawer only"** (default safe path) or tell me which of 5/6 you want done differently, and I'll ship 1–4 immediately plus your choice on 5–6.

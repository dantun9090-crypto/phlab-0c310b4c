# Customer password help in Admin + Firebase/account audit

## Goal
Admins can help a customer who cannot sign in: send them a password-reset link, or set a temporary password on the spot and tell them to change it after logging in. Plus a written health check of account signup / reset / rules.

## Part 1 — Admin: password help for a customer
In Admin → Customers, next to each customer (alongside the existing remove/anonymise controls), add a "Password" action with two options:

1. **Send reset link** — emails the customer a Firebase password-reset link (same flow as the login page's "forgot password", but triggered by the admin).
2. **Set temporary password** — admin types a password (or clicks "Generate" for a readable one like `Lab-7742-Peptide`), it is applied immediately, all the customer's existing sessions are signed out, and the admin sees the password once so they can pass it on by phone/email. Optionally send the customer an email saying their password was reset by support and should be changed.

Guardrails:
- Both actions require a signed-in admin; the check happens on the server, never in the browser.
- Minimum length follows the existing password policy (6 chars).
- Every action is written to the audit log (which admin, which customer, which action, timestamp) and to auth events.
- The temporary password is shown only in the response to the admin who set it — never stored in the database or logged.

## Part 2 — Audit report (no behaviour change unless a real bug is found)
I will verify and report on:
- Account creation (register), sign-in, sign-out, email verification.
- Password reset end-to-end: the rate-limited server path and its client fallback, and the reset-password page.
- Admin gate consistency (Firestore `isAdmin` flag vs custom claims).
- Firestore rules for `customers`, `orders`, `auditLogs`, and privileged-field protection.
If the audit turns up an actual defect (e.g. a reset email path that silently fails), I'll fix it and call it out; otherwise the report just confirms the state.

## Technical notes
- New server route `src/routes/api/admin/customer-password.ts`, same shape as the existing `customer-delete` route: verifies the caller's Firebase ID token via `requireFirebaseAdmin`, then uses a service-account access token (pattern already in `src/lib/server/firebase-auth-delete.ts`) to call Identity Toolkit:
  - `accounts:update` for the password change + `validSince` bump to revoke sessions,
  - `accounts:sendOobCode` (PASSWORD_RESET) for the reset-link option, with the canonical `phlabs.co.uk` referer/origin headers already used in `auth-throttle.functions.ts`.
- Password-generation helper stays server-side; audit entries written with `addDocAdmin` to `auditLogs`.
- UI changes confined to `src/pages/Admin/tabs/CustomersTab.tsx`, keeping existing admin form styling (border-2 border-slate-600, bg-slate-800, min-h-[48px]).
- No changes to worker/cache/CSP/prerender code, no design changes.

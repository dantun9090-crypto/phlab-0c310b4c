# Royal Mail Label — Worker + Admin Button

Two parts: (1) a new Cloudflare Worker that talks to Royal Mail's Click & Drop API, (2) a button in the admin Order Detail modal that calls it.

## 1. New Cloudflare Worker

Create `cloudflare/royal-mail-label-worker.js` (source kept in repo for reference) and deploy it as a separate Worker on the existing Cloudflare account (zone `phlabs.co.uk`, account `2e52fa1ba0b76b79976789b02cf9e80a`).

- **Name**: `royal-mail-label`
- **Final URL**: `https://royal-mail-label.phlabs-workers.workers.dev` (exact subdomain confirmed at deploy time; the placeholder `twoj-subdomain` in your message will be replaced)
- **Route**: workers.dev only — not bound to phlabs.co.uk (keeps it isolated from the prerender Worker)

**Secrets stored on the Worker (never in frontend):**
- `ROYAL_MAIL_API_KEY` — Click & Drop API token
- `ALLOWED_ORIGIN` = `https://phlabs.co.uk` (+ preview origin for testing)
- `SHARED_SECRET` — random string the admin UI sends in `x-phlabs-auth` header so random internet traffic can't burn the RM quota

**Worker behaviour:**
- `POST /` only, JSON body: `{ orderId, firstName, lastName, addressLine1, addressLine2?, postcode, email, service, weightGrams }`
- Validate `service ∈ {CRL1, CRL2, TRM}`, postcode regex, weight 1–2000g, strings ≤200 chars.
- CORS: allow `ALLOWED_ORIGIN`, methods `POST, OPTIONS`, header `content-type, x-phlabs-auth`.
- Reject unless `x-phlabs-auth` matches `SHARED_SECRET` (timing-safe compare).
- Call Royal Mail Click & Drop `POST /api/v1/orders` with the mapped service code, then request label PDF.
- Respond `{ trackingNumber, labelUrl? }` on success or `{ error: "<message>" }` with appropriate status on failure.
- Log only `orderId` + status code (no PII, no API key).

You'll need to provide `ROYAL_MAIL_API_KEY` once via the secrets tool when we deploy.

## 2. Admin UI — Order Detail Modal

Edit `src/pages/Admin/tabs/OrdersTab.tsx` (right above the existing tracking input block, ~line 1100):

- New section "Royal Mail Label":
  - Service dropdown: `2nd Class (CRL1)` / `1st Class (CRL2)` / `Tracked 24 (TRM)`. Default CRL1.
  - Weight input (grams, default `100`).
  - Primary button **"Generate Royal Mail Label"** (emerald, matches existing admin primary style).
- On click:
  1. Collect from `selected`: `firstName`, `lastName`, `addressLine1`, `addressLine2`, `postcode`, `email` (from `selected.customer` / `selected.shippingAddress` / `selected.userEmail`), plus `orderId = selected.id`, chosen `service`, `weightGrams`.
  2. `fetch(WORKER_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-phlabs-auth': VITE_RM_WORKER_TOKEN }, body: JSON.stringify(payload) })`.
  3. On 2xx: show `trackingNumber` in a read-only input with a **Copy** button; render `labelUrl` as "Open Label PDF" link (target=_blank) if present; write to Firestore: `updateDoc(doc(db,'orders',selected.id), { royalMailTracking: trackingNumber, royalMailService: service, royalMailLabelUrl: labelUrl ?? null, royalMailGeneratedAt: serverTimestamp() })`; also prefill the existing `trackingInput` + set courier to `Royal Mail` so the existing **Dispatch** flow can send the shipped email.
  4. On error: show the worker's `error` message inline (red), no crash.
  5. Log via `logAdminAction({ action: 'order.dispatch', target: \`orders/${selected.id}\`, meta: { royalMail: { service, trackingNumber } } })`.

**Frontend env (added to `.env` + Lovable env):**
- `VITE_ROYAL_MAIL_WORKER_URL` — final workers.dev URL
- `VITE_ROYAL_MAIL_WORKER_TOKEN` — same value as `SHARED_SECRET`. (Public-ish, but still gates casual abuse; the real RM key stays on the Worker.)

## 3. Firestore

No rules change needed — `orders` already allows admin updates. New fields `royalMailTracking`, `royalMailService`, `royalMailLabelUrl`, `royalMailGeneratedAt` will simply appear on order documents.

## 4. Files touched

- `cloudflare/royal-mail-label-worker.js` (new) — Worker source
- `cloudflare/royal-mail-label-wrangler.toml` (new) — deploy config
- `src/pages/Admin/tabs/OrdersTab.tsx` — new "Royal Mail Label" section inside the order detail modal + handler
- `.env` — two new `VITE_ROYAL_MAIL_*` entries

## 5. Verification

- Deploy Worker, confirm `OPTIONS` returns CORS headers and `POST` without auth returns 401.
- In admin: open a test order, pick CRL1, click Generate → tracking number appears, Firestore doc updated, copy button works, label link opens.
- Bad postcode → red error from Worker shown inline; no Firestore write.

## Questions before I build
- **Worker URL**: I'll deploy under `royal-mail-label.<your-cf-workers-subdomain>.workers.dev`. Do you have an existing workers.dev subdomain to use, or shall I pick one (e.g. `phlabs-workers`)?
- **API key**: do you already have a Royal Mail Click & Drop API token? If yes, after you approve this plan I'll request it via the secrets tool.
- **Service mapping**: confirm `CRL1 = 2nd Class`, `CRL2 = 1st Class`, `TRM = Tracked 24` as you wrote — these are the Click & Drop `serviceCode` values; just double-checking they're the right ones for your account.

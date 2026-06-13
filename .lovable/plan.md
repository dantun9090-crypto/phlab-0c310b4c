## Royal Mail Order Worker — wire-up plan

The Worker is already deployed at `https://royal-mail-order.dantun9090.workers.dev`. This plan adds a matching repo copy, replaces the existing "Generate Royal Mail Label" button with a "Create Royal Mail Order" button, and removes the old label worker.

### 1. Worker source in repo (reference copy)

- Add `cloudflare/royal-mail-order-worker.js` — Click & Drop `POST /api/v1/orders` proxy that **creates the order only** (no label PDF), returns `{ orderIdentifier, orderReference, trackingNumber? }`.
- Add `cloudflare/royal-mail-order-wrangler.toml` with `name = "royal-mail-order"`, `workers_dev = true`, observability on.
- Delete `cloudflare/royal-mail-label-worker.js` and `cloudflare/royal-mail-label-wrangler.toml` (label flow removed).

Worker contract (same security shape as before):
- `POST /` JSON `{ orderId, firstName, lastName, addressLine1, addressLine2?, city?, postcode, email, service, weightGrams }`
- Header `x-phlabs-auth` must equal `SHARED_SECRET` (timing-safe compare)
- CORS: `https://phlabs.co.uk`, `https://www.phlabs.co.uk`, `https://phlab.lovable.app`, `*.lovable.app`
- Validates service ∈ `{CRL1, CRL2, TRM}`, UK postcode, weight 1–2000g
- Calls Click & Drop with `Authorization: Bearer ROYAL_MAIL_API_KEY`
- Logs only `orderId` + status (no PII, no key)

Secrets on the deployed Worker (you confirm they're set): `ROYAL_MAIL_API_KEY`, `SHARED_SECRET`.

### 2. Admin UI — replace the label button

Edit `src/pages/Admin/tabs/OrdersTab.tsx`:
- Rename existing "Royal Mail Label" section → **"Create Royal Mail Order"**.
- Drop the `labelUrl` / "Open Label PDF" UI and any label-related state.
- Keep the service dropdown (CRL1 / CRL2 / TRM) and weight input (default 100g).
- Button calls `VITE_ROYAL_MAIL_WORKER_URL` with `x-phlabs-auth: VITE_ROYAL_MAIL_WORKER_TOKEN` and the order payload built from `selected` (customer + shipping address).
- On success:
  - Show `trackingNumber` (if returned) in a read-only field with a Copy button, plus `orderIdentifier` for reference.
  - Firestore `updateDoc(orders/{id}, { royalMailOrderId, royalMailService, royalMailTracking, royalMailCreatedAt: serverTimestamp() })`.
  - Prefill the existing `trackingInput` + courier `Royal Mail` so the existing Dispatch flow can send the shipped email.
  - `logAdminAction({ action: 'order.royal_mail_create', target: 'orders/{id}', meta: { service, royalMailOrderId } })`.
- On error: show worker's `error` message inline (red), no crash.

### 3. Env

`.env`:
- `VITE_ROYAL_MAIL_WORKER_URL="https://royal-mail-order.dantun9090.workers.dev"`
- `VITE_ROYAL_MAIL_WORKER_TOKEN=""` ← still empty; you'll need to paste the `SHARED_SECRET` value (the same string set on the Worker) before Generate works. I'll leave the placeholder and call it out.

### 4. Firestore

No rules change. New optional fields on `orders`: `royalMailOrderId`, `royalMailService`, `royalMailTracking`, `royalMailCreatedAt`. Old `royalMailLabelUrl` / `royalMailGeneratedAt` from the previous attempt are left untouched on existing docs (harmless).

### 5. Files touched

- `cloudflare/royal-mail-order-worker.js` (new)
- `cloudflare/royal-mail-order-wrangler.toml` (new)
- `cloudflare/royal-mail-label-worker.js` (deleted)
- `cloudflare/royal-mail-label-wrangler.toml` (deleted)
- `src/pages/Admin/tabs/OrdersTab.tsx` (label section → order section)
- `.env` (set `VITE_ROYAL_MAIL_WORKER_URL`)

### 6. Verification

- `curl -X OPTIONS` → 204 with CORS headers.
- `curl -X POST` without `x-phlabs-auth` → 401.
- Admin: open a test order → pick CRL1 → Create → tracking/orderIdentifier shows, Firestore updated, dispatch flow still works.

### Open item before this goes live

You must paste the `SHARED_SECRET` value into `VITE_ROYAL_MAIL_WORKER_TOKEN` (or let me request it via the secrets tool) — the button will return 401 until then. Confirm and I'll switch to build mode.

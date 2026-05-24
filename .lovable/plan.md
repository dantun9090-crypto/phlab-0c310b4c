## Goal

Move the admin IP whitelist check off the client so an authenticated admin can't bypass it in DevTools, and make it fail **closed** (not open) on errors when the guard is enabled.

## What changes

### 1. New server function — `src/lib/admin-ip-gate.functions.ts`

A TanStack `createServerFn` that runs in the Cloudflare Worker:

- Reads the caller's IP from request headers, in this priority:
  - `cf-connecting-ip` (Cloudflare — authoritative for our deploy)
  - first entry of `x-forwarded-for`
  - `x-real-ip`
- Fetches `settings/ipWhitelist` and the `ipWhitelist` collection from Firestore via the REST API (same pattern already used in `cart-validation.functions.ts`).
- Returns `{ allowed: boolean, ip: string | null, enforced: boolean, reason?: string }`.

Behaviour:

- If `settings/ipWhitelist.enabled !== true` → `allowed: true, enforced: false` (no change in behaviour for projects that haven't turned the guard on).
- If enabled and Firestore reads succeed → match `ip` against entries (exact match + basic IPv4 CIDR, mirroring today's logic).
- If enabled and we **cannot determine the IP** or Firestore is unreachable → `allowed: false` (fail closed). This fixes the current `catch { return true; }` fail-open bug called out in the finding.

The function does **not** verify the Firebase user identity — IP gating is independent of who you are. Identity is still enforced by the existing `isAdmin` check on `customers/{uid}`.

### 2. Wire the server gate into `src/pages/Admin/index.tsx`

- Remove the local `checkIpAllowed()` function and the dynamic `firebase/firestore` import inside it.
- Replace the `useEffect` that calls `checkIpAllowed()` with a call to the new server fn via `useServerFn`.
- Keep the same `ipChecked` / `ipAllowed` state flow and the existing "Access Restricted" UI — only the source of truth changes.
- Render nothing admin-related until the server responds; the existing loading spinner already covers this.

### 3. Keep `IpWhitelistTab` as-is

The admin tab that manages whitelist entries (`src/pages/Admin/tabs/IpWhitelistTab.tsx`) still uses `api.ipify.org` and direct Firestore reads. That's fine — it's just a UI for showing "your current IP" and editing entries. The **enforcement** is what moves server-side.

### 4. Mark the security finding fixed

After implementation, call `manage_security_finding` with `mark_as_fixed` for `agent_security:ip_whitelist_clientside`, explaining that enforcement moved to a Worker-side server function that reads `cf-connecting-ip` and fails closed.

## What this fix does NOT do (important caveat)

This gate blocks the **Admin UI shell** from rendering for off-whitelist IPs. It does **not** prevent an attacker who already has admin Firebase credentials from talking to Firestore directly with the Firebase SDK from any IP — Firestore security rules see the user but not the request IP, and there's no Cloud Function proxy in this project. A complete fix would also require either:

- Tightening Firestore security rules + adding Firebase App Check, or
- Routing admin writes through server functions that enforce IP there too.

I'll flag this in the "mark as fixed" explanation so it's tracked, and we can do that as a follow-up if you want full data-layer enforcement.

## Files touched

- **Create** `src/lib/admin-ip-gate.functions.ts`
- **Edit** `src/pages/Admin/index.tsx` (remove client check, call server fn)
- No design/layout changes; admin shell, header, sidebar untouched.

Ready to switch to build mode and apply this?

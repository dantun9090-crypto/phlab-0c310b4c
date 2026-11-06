# Wallid OFF (4–5 XI) — end-to-end investigation + Ads conversion check

Current state: the backend is up and responding now. What caused the outage on 4–5 November is not confirmed yet. Step 1 is to establish it from logs, not to guess.

## 1. Outage timeline (read-only)
- Backend history: when it was paused and resumed (pause because Cloud funds ran out vs restart vs unhealthy state).
- Server logs and `error_events` / `webhookLogs` / `auditLogs` from 3–6 XI: first error reading the payment setting, last successful Wallid session, first and last "Wallid unavailable".
- Admin audit log: did anyone toggle Wallid / checkout pause / BrokkrPay by hand.
- Firestore orders: the gap with no Wallid orders (exact start and end time), number of carts abandoned at checkout during that window.
- Wallid API: test session creation now (read-only, no payment) plus their webhooks from that window.

## 2. Revenue impact
- Paid orders per hour for 3–6 XI compared with the previous days, showing lost revenue during the outage.

## 3. Google Ads conversions (read-only, no changes)
- Offline import: the latest uploads, success/error status, whether orders from 31 X–3 XI came through after 48h.
- "Purchase (website)" tag: conversions for 3–6 XI.
- Paid orders with gclid/gbraid/wbraid compared with conversions in Ads; any gaps.
- PMax spend, ROAS and learning status over the last days.

## 4. Fix (only after the cause is confirmed)
- If the cause was the backend pausing (no funds): a backend health alert e-mail to info@ plus a clear message in the admin panel. Wallid stays fail-closed, so no payments go through without a confirmed setting.
- If it was a manual toggle or another cause: a matching targeted fix, shown in the Admin → Payments tab.
- No changes to Google Ads, checkout logic, CSP or robots.

## Deliverable
A report in Polish: timeline, cause, lost revenue, conversion status, and what is being fixed.

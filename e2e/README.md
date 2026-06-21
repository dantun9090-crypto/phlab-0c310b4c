# Wallid Payment Smoke Tests

Three critical-path Playwright tests for the Wallid Pay-by-Bank flow.

## Run

```bash
WALLID_WEBHOOK_SECRET=... bunx playwright test
```

Optional overrides:

| Var                     | Default                           | Purpose                              |
| ----------------------- | --------------------------------- | ------------------------------------ |
| `TEST_BASE_URL`         | Preview lovable URL               | Target deployment                    |
| `WALLID_WEBHOOK_SECRET` | _(unset → tests 1 & 2 skip)_      | HMAC secret matching the server      |
| `TEST_STUCK_ORDER_ID`   | _(unset → test 3 skips)_          | Firestore order in `pending_payment` |
| `ADMIN_BEARER_TOKEN`    | _(unset → test 3 skips)_          | Firebase ID token of an admin        |

Without secrets the suite still runs cleanly and reports skipped tests —
safe to wire into CI before secrets are provisioned.

## Tests

1. **Happy path** — POST a signed `SUCCESS` event → expect `200`,
   `processed >= 1`, and the `cache-control: no-store` header.
2. **Idempotency** — POST the same `{event_id, api_payment_id}` twice →
   expect `processed=0` on the second call (composite unique key).
3. **Manual sync** — invoke `/api/public/hooks/wallid-reconcile` with an
   admin bearer for a stuck order → expect the reconciler to respond
   without 5xx.

Expand later by adding race-condition, signature-tampering, rate-limit,
and full UI checkout scenarios.

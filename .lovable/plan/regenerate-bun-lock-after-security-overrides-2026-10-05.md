# Regenerate bun.lock after security overrides

## Context
- package.json has overrides `@fastify/busboy@3.2.1` and `@grpc/grpc-js@^1.14.5` (overrides + resolutions); committed bun.lock is stale.
- Sandbox bun 1.3.3 writes `lockfileVersion: 1` (readable by bun 1.2.x). Do not upgrade bun.
- git add/commit/push is handled by the platform auto-sync.

## Steps
1. `bun install` (no flags).
2. Confirm bun.lock starts with `"lockfileVersion": 1`; otherwise revert and stop.
3. Verify: `@fastify/busboy@3.2.1` exactly; `@grpc/grpc-js@1.14.5+` (1.14.x):
   ```bash
   grep -o '"@fastify/busboy@3.2.1"' bun.lock
   grep -o '"@grpc/grpc-js@1.14.5"' bun.lock
   ```
4. `bun run security:scan` must exit 0 (skip if network blocked).
5. `bun run build`.
6. Lockfile syncs to GitHub automatically.

## Boundaries
- No source/design/checkout/payment//compound changes; package.json untouched; no other upgrades; no publish.

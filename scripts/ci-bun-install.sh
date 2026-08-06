#!/usr/bin/env bash
set -euo pipefail

# Try the reproducible path first: install exactly what bun.lock pins.
log_file="$(mktemp)"
if bun install --frozen-lockfile 2>&1 | tee "$log_file"; then
  rm -f "$log_file"
  exit 0
fi

# If the frozen install failed because package.json and bun.lock drifted
# (e.g. a PR bumps dependencies or overrides without a regenerated lockfile),
# refresh the lockfile in this CI workspace so checks can still run. The
# refreshed lockfile is workspace-local — the committed bun.lock is only
# updated when someone commits it.
if ! grep -Eqi "lockfile had changes, but lockfile is frozen|lockfile.*frozen" "$log_file"; then
  rm -f "$log_file"
  exit 1
fi

rm -f "$log_file"
echo "::notice::package.json changed without an updated bun.lock; refreshing the lockfile in this CI workspace so checks can run."
bun install
bun install --frozen-lockfile

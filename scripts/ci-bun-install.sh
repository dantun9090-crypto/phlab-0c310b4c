#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_EVENT_NAME:-}" != "pull_request" || "${GITHUB_ACTOR:-}" != dependabot* ]]; then
  exec bun install --frozen-lockfile
fi

log_file="$(mktemp)"
if bun install --frozen-lockfile 2>&1 | tee "$log_file"; then
  rm -f "$log_file"
  exit 0
fi

if ! grep -Eqi "lockfile had changes, but lockfile is frozen|lockfile.*frozen" "$log_file"; then
  rm -f "$log_file"
  exit 1
fi

rm -f "$log_file"
echo "::notice::Dependabot changed package.json without bun.lock; refreshing the lockfile in this CI workspace so checks can run."
bun install
bun install --frozen-lockfile
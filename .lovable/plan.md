# Regenerate bun.lock after security overrides

## Context
- Sandbox bun is 1.3.3 (not 1.4); it writes `bun.lock` with `lockfileVersion: 1` — the same text format already in the repo, readable by bun 1.2.x. No v3 format risk.
- `git add/commit/push` cannot be run by me: git is managed by the platform, and every change auto-commits and syncs to GitHub.

## Steps
1. Run `bun install` once to re-resolve against the current `overrides` in package.json.
2. Confirm `bun.lock` still starts with `"lockfileVersion": 1` (if anything else appears, revert and stop).
3. Check the lockfile now resolves each overridden package to the required version.
4. Run the build to confirm nothing broke.
5. The updated lockfile syncs to GitHub automatically (commit message set by the platform).

No source, design, checkout, payment, or /compound changes. Not published unless you ask.

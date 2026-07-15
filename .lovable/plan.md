# Save GitHub access to memory

Add a Core line to `mem://index.md` noting that the agent has GitHub connector access (via `standard_connectors` gateway, `GITHUB_API_KEY` secret), so future sessions won't ask the user to reconnect or claim no access.

## Changes
- **`mem://index.md`** — add to Core:
  > GitHub connector is linked — call GitHub REST API via `https://connector-gateway.lovable.dev/github` with `LOVABLE_API_KEY` + `GITHUB_API_KEY`. Do not tell the user access is missing.

No other files change.

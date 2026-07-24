# Admin AI Assistant — providers

The admin AI Assistant (Admin → AI Assistant) supports two providers,
selectable via the toggle in the tab header:

| Provider | Model | Env var (Cloudflare Pages, production) |
|---|---|---|
| Gemini (Lovable AI Gateway) | `google/gemini-3-flash-preview` | `LOVABLE_API_KEY` |
| Kimi (Moonshot AI) | `kimi-k3` (override via `KIMI_MODEL`) | `KIMI_API_KEY` |

## How it works

- `src/lib/ai-admin.functions.ts` — server function `aiAdminChat` verifies the
  Firebase ID token + `isAdmin` on every call, then routes to the selected
  provider. API keys never reach the client bundle.
- Kimi calls the OpenAI-compatible Moonshot endpoint
  (`https://api.moonshot.ai/v1/chat/completions`). The `temperature` field is
  intentionally omitted — current Kimi models (kimi-k3, kimi-k2.6) reject any
  value other than 1.

## Rotating the Kimi key

1. Generate a new key at platform.moonshot.ai → API Keys.
2. Update `KIMI_API_KEY`: Cloudflare dashboard → Workers & Pages → phlabs →
   Settings → Variables and Secrets (production).
3. Redeploy (any push to `main`, or retry the deploy workflow) — env changes
   only bind on new deployments.

Note: the GitHub repository secret of the same name is NOT read by the live
site — Pages Functions read env from the Pages project config only.

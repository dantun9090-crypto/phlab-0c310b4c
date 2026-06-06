/**
 * Lovable AI Gateway provider helper. Server-only.
 *
 * Reads LOVABLE_API_KEY at call time inside a server function/route handler.
 * Use the returned `gateway(modelId)` as the `model` argument to AI SDK
 * functions like `generateText` or `streamText`.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

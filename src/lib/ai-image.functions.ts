/**
 * Admin AI image generation — via the phlabs-ai-gateway Worker (Cloudflare
 * Workers AI, Flux models). Optionally rewrites the admin's rough idea into
 * a compliant, detailed prompt with Kimi first.
 *
 * Returns base64 image data; the client uploads it to Firebase Storage with
 * the admin's own Firebase session (same flow as product image uploads).
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  prompt: z.string().trim().min(3).max(1500),
  enhance: z.boolean().default(true),
  model: z.enum([
    '@cf/black-forest-labs/flux-1-schnell',
    '@cf/black-forest-labs/flux-2-dev',
  ]).default('@cf/black-forest-labs/flux-1-schnell'),
});

const PROMPT_SYSTEM = `You write image-generation prompts for PH Labs, a UK laboratory research compounds supplier.
STRICT RULES for every prompt you produce:
- Subject matter: laboratory glassware, lyophilised powder vials, clean bench setups, dark navy/teal scientific aesthetic, abstract molecule diagrams, cold-chain packaging.
- NEVER include: syringes, needles, pills, tablets, medical crosses, human bodies or body parts, doctors, patients, gym imagery, muscles, weight-loss imagery.
- Style: premium product photography or clean 3D render, studio lighting, no text overlays unless explicitly asked.
Output ONLY the final prompt text — no explanations, no quotes.`;

export const aiGenerateImage = createServerFn({ method: 'POST' })
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const gatewayUrl = process.env.AI_GATEWAY_URL;
    const gatewaySecret = process.env.AI_GATEWAY_SECRET;
    if (!gatewayUrl || !gatewaySecret) {
      return { ok: false as const, error: 'AI gateway is not configured (AI_GATEWAY_URL / AI_GATEWAY_SECRET missing)' };
    }

    let prompt = data.prompt;
    let enhancedPrompt: string | undefined;

    // Optional: Kimi rewrites the rough idea into a compliant, detailed prompt.
    if (data.enhance) {
      try {
        const r = await fetch(`${gatewayUrl}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-gateway-secret': gatewaySecret },
          body: JSON.stringify({
            system: PROMPT_SYSTEM,
            messages: [{ role: 'user', content: `Write an image prompt for: ${data.prompt}` }],
          }),
        });
        const j: any = await r.json().catch(() => null);
        if (j?.ok && typeof j.text === 'string' && j.text.trim().length > 10) {
          enhancedPrompt = j.text.trim() as string;
          prompt = enhancedPrompt;
        }
      } catch {
        /* fall back to the raw prompt */
      }
    }

    try {
      const r = await fetch(`${gatewayUrl}/image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-gateway-secret': gatewaySecret },
        body: JSON.stringify({ prompt, model: data.model }),
      });
      const j: any = await r.json().catch(() => null);
      if (!j?.ok || typeof j.base64 !== 'string') {
        return { ok: false as const, error: j?.error || `Image generation failed (HTTP ${r.status})`, prompt };
      }
      return { ok: true as const, base64: j.base64, prompt, enhancedPrompt };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e), prompt };
    }
  });

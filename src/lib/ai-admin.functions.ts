/**
 * Admin-only AI assistant — backed by Lovable AI Gateway, Kimi (Moonshot),
 * or Cloudflare Workers AI (via the phlabs-ai-gateway Worker).
 *
 * Verifies Firebase ID token + isAdmin on every call. Never exposes
 * LOVABLE_API_KEY / KIMI_API_KEY / AI_GATEWAY_SECRET to the client.
 * Supports five "modes" that map to different system prompts and optional
 * Firestore context injection.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { generateText } from 'ai';
import { createLovableAiGatewayProvider } from './ai-gateway.server';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';
import { listDocsAdmin } from './server/firestore-admin';

const MODEL = 'google/gemini-3-flash-preview';
const KIMI_API_URL = 'https://api.moonshot.ai/v1/chat/completions';

const Mode = z.enum(['chat', 'product_copy', 'email_draft', 'insights', 'blend_check']);

const Message = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  mode: Mode,
  provider: z.enum(['lovable', 'kimi', 'workers-ai']).default('workers-ai'),
  messages: z.array(Message).min(1).max(40),
  // Optional structured input for the tool modes (used to pre-fill prompt)
  meta: z.record(z.string(), z.string().max(2000)).optional(),
});

const BRAND = `PH Labs (phlabs.co.uk) — UK peptide research e-commerce shop.
- Currency: GBP (£). Market: UK.
- All products are sold strictly "For Research Use Only. Not for Human Consumption."
- NEVER write copy that claims to treat, cure, heal, or is medicine / drug / prescription.
- NEVER mention dosage instructions, human use, injection technique, weight loss, anti-aging, muscle growth, diabetes, or cancer as product claims.
- Always frame outcomes as preclinical / trial / investigational findings. Add an investigational disclaimer when discussing efficacy.
- Tone: precise, scientific, professional. No hype, no emojis in product copy.`;

const SYSTEM: Record<z.infer<typeof Mode>, string> = {
  chat: `You are the PH Labs Admin Assistant.
${BRAND}
Help the admin operate the shop: answer questions about orders, customers, inventory, SEO, compliance, and marketing strategy. When unsure, say so. Keep answers short and actionable. Use markdown.`,

  product_copy: `You generate UK peptide research product copy for PH Labs.
${BRAND}
Given a product name / category / molecular weight / notes from the admin, produce:
1. SEO title (<60 chars)
2. Meta description (<160 chars)
3. Short product description (2–3 sentences)
4. Three bullet research points (preclinical framing only)
5. The required compliance disclaimer sentence.
Return as clean markdown. No medical claims.`,

  email_draft: `You draft emails for PH Labs admin.
${BRAND}
Match the brand tone — precise, professional, warm but not casual. Use British English spelling. Always sign off as "The PH Labs Team". Return only the email body in clean markdown unless the admin asks for subject + body.`,

  insights: `You analyse PH Labs operational data and produce a concise admin briefing.
${BRAND}
You will be given recent orders / customers / stock data as JSON context. Produce:
- Headline summary (1 sentence)
- Key metrics (bullet list)
- Anomalies or risks (bullet list)
- Recommended actions (bullet list, max 5)
Use markdown. Be specific and quantitative. If data is empty, say so.`,

  blend_check: `You are the PH Labs blend product analyst.
${BRAND}
You will be given JSON context for the shop's BLEND products (GLOW, KLOW, etc.) and their individual component products. The context includes, per blend: the declared composition, the blend's price, the summed price of its components, stock levels, and any missing fields detected deterministically in code.
Produce a "Blend Health Check" report:
- One line per blend: status OK or ISSUE, with the reason
- Pricing sanity: flag blends priced ABOVE the sum of their components (hard to sell) or suspiciously below (margin leak)
- Stock risk: blends whose components are low/out of stock
- Data gaps: missing descriptions, specs, or CoA fields
- Recommended actions (bullet list, max 5)
Use markdown. Be quantitative. Never invent figures that are not in the context.`,
};

async function buildInsightsContext(): Promise<string> {
  try {
    const [orders, customers, stock] = await Promise.all([
      listDocsAdmin('orders', { orderBy: 'createdAt', limit: 50 }).catch(() => []),
      listDocsAdmin('customers', { orderBy: 'createdAt', limit: 50 }).catch(() => []),
      listDocsAdmin('product_stock', { limit: 100 }).catch(() => []),
    ]);

    // Trim PII / large fields — keep only what's useful for analysis
    const trimmedOrders = orders.map((o: any) => ({
      id: o.id,
      status: o.status,
      total: o.totalPrice ?? o.total,
      currency: o.currency,
      createdAt: o.createdAt,
      shippingMethod: o.shippingMethod,
      nextDayMissedCutoff: o.nextDayMissedCutoff,
    }));
    const trimmedStock = stock.map((s: any) => ({
      id: s.id,
      name: s.name ?? s.title,
      stock: s.stock ?? s.quantity,
      price: s.price,
    }));
    const customerCount = customers.length;

    return JSON.stringify({
      generatedAt: new Date().toISOString(),
      orders: trimmedOrders,
      stock: trimmedStock,
      recentCustomerCount: customerCount,
    });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'context_failed' });
  }
}

/** Known blend compositions (matches the merchant feed COMPOUND_SPECS). */
const BLEND_COMPONENTS: Record<string, string[]> = {
  'glow-blend': ['ghk-cu-research-peptide', 'bpc-157', 'tb-500-thymosin-beta-4'],
  'klow-blend': ['kpv-research-peptide', 'ghk-cu-research-peptide', 'bpc-157', 'tb-500-thymosin-beta-4'],
};

async function buildBlendContext(): Promise<string> {
  try {
    const stock = await listDocsAdmin('product_stock', { limit: 200 }).catch(() => []);
    const bySlug = new Map<string, any>();
    for (const p of stock as any[]) {
      if (p && typeof p.slug === 'string') bySlug.set(p.slug.toLowerCase(), p);
    }

    const blends = Object.entries(BLEND_COMPONENTS).map(([slug, components]) => {
      const blend = bySlug.get(slug);
      const compDetails = components.map((c) => {
        const p = bySlug.get(c);
        return {
          slug: c,
          present: Boolean(p),
          price: typeof p?.price === 'number' ? p.price : null,
          stock: typeof p?.stock === 'number' ? p.stock : null,
        };
      });
      const componentSum = compDetails.reduce((acc, c) => acc + (c.price ?? 0), 0);
      const blendPrice = typeof blend?.price === 'number' ? blend.price : null;
      return {
        slug,
        present: Boolean(blend),
        name: blend?.name ?? null,
        price: blendPrice,
        stock: typeof blend?.stock === 'number' ? blend.stock : null,
        hasDescription: Boolean(blend?.description && String(blend.description).trim().length > 20),
        includeInMerchantFeed: blend?.includeInMerchantFeed === true,
        components: compDetails,
        componentPriceSum: Number(componentSum.toFixed(2)),
        priceVsComponentSum: blendPrice !== null ? Number((blendPrice - componentSum).toFixed(2)) : null,
      };
    });

    return JSON.stringify({ generatedAt: new Date().toISOString(), blends });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'context_failed' });
  }
}

/**
 * Kimi (Moonshot AI) — OpenAI-compatible chat completions endpoint.
 * Server-side only: the key never leaves the Pages environment.
 * Note: current Kimi models (kimi-k3, kimi-k2.6) reject any temperature
 * other than 1, so the field is omitted and the API default is used.
 */
async function callKimi(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<string> {
  const res = await fetch(KIMI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        ...opts.messages,
      ],
    }),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Kimi API HTTP ${res.status}${body ? `: ${body}` : ''}`);
  }
  const json: any = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Kimi API returned an empty completion');
  }
  return text;
}

/**
 * Cloudflare Workers AI — via the phlabs-ai-gateway Worker (AI binding,
 * no API key needed). Only the shared gateway secret travels over the wire.
 */
async function callWorkersAi(opts: {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<string> {
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const gatewaySecret = process.env.AI_GATEWAY_SECRET;
  if (!gatewayUrl || !gatewaySecret) {
    throw new Error('AI gateway is not configured (AI_GATEWAY_URL / AI_GATEWAY_SECRET missing)');
  }
  const res = await fetch(`${gatewayUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gateway-secret': gatewaySecret,
    },
    body: JSON.stringify({
      model: process.env.WORKERS_AI_MODEL || '@cf/moonshotai/kimi-k2.6',
      system: opts.system,
      messages: opts.messages,
    }),
  });
  const json: any = await res.json().catch(() => null);
  if (!json?.ok) {
    throw new Error(json?.error || `AI gateway HTTP ${res.status}`);
  }
  return json.text as string;
}

export const aiAdminChat = createServerFn({ method: 'POST' })
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const system = SYSTEM[data.mode];

    // Inject Firestore context for data-driven modes
    const messages = [...data.messages];
    if (data.mode === 'insights') {
      const context = await buildInsightsContext();
      messages.unshift({
        role: 'user',
        content: `Operational data (JSON):\n\`\`\`json\n${context}\n\`\`\``,
      });
    } else if (data.mode === 'blend_check') {
      const context = await buildBlendContext();
      messages.unshift({
        role: 'user',
        content: `Blend product data (JSON):\n\`\`\`json\n${context}\n\`\`\``,
      });
    }

    // ── Cloudflare Workers AI provider (default) ─────────────────────────
    if (data.provider === 'workers-ai') {
      try {
        const text = await callWorkersAi({
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        return { ok: true as const, text };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('401') || msg.includes('unauthorized')) {
          return { ok: false as const, error: 'AI gateway secret rejected (401) — check AI_GATEWAY_SECRET matches the Worker.' };
        }
        return { ok: false as const, error: msg };
      }
    }

    // ── Kimi (Moonshot AI) provider ──────────────────────────────────────
    if (data.provider === 'kimi') {
      const kimiKey = process.env.KIMI_API_KEY;
      if (!kimiKey) {
        return { ok: false as const, error: 'KIMI_API_KEY is not configured — add it in Cloudflare Pages → Settings → Environment variables.' };
      }
      try {
        const text = await callKimi({
          apiKey: kimiKey,
          model: process.env.KIMI_MODEL || 'kimi-k3',
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        return { ok: true as const, text };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('401')) {
          return { ok: false as const, error: 'Kimi API key rejected (401) — check KIMI_API_KEY in Cloudflare Pages env vars.' };
        }
        if (msg.includes('429')) {
          return { ok: false as const, error: 'Kimi rate limit reached — please wait a moment and try again.' };
        }
        return { ok: false as const, error: msg };
      }
    }

    // ── Lovable AI Gateway provider ──────────────────────────────────────
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { ok: false as const, error: 'LOVABLE_API_KEY is not configured' };
    }

    const gateway = createLovableAiGatewayProvider(key);

    try {
      const { text } = await generateText({
        model: gateway(MODEL),
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      return { ok: true as const, text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Surface rate-limit / credit errors clearly
      if (msg.includes('429')) {
        return { ok: false as const, error: 'AI rate limit reached — please wait a moment and try again.' };
      }
      if (msg.includes('402')) {
        return { ok: false as const, error: 'AI credits exhausted — top up Lovable workspace credits to continue.' };
      }
      return { ok: false as const, error: msg };
    }
  });

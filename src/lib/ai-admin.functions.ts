/**
 * Admin-only AI assistant — backed by Lovable AI Gateway.
 *
 * Verifies Firebase ID token + isAdmin on every call. Never exposes
 * LOVABLE_API_KEY to the client. Supports four "modes" that map to
 * different system prompts and optional Firestore context injection.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { generateText } from 'ai';
import { createLovableAiGatewayProvider } from './ai-gateway.server';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';
import { listDocsAdmin } from './server/firestore-admin';

const MODEL = 'google/gemini-3-flash-preview';

const Mode = z.enum(['chat', 'product_copy', 'email_draft', 'insights']);

const Message = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  mode: Mode,
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

export const aiAdminChat = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { ok: false as const, error: 'LOVABLE_API_KEY is not configured' };
    }

    const gateway = createLovableAiGatewayProvider(key);
    const system = SYSTEM[data.mode];

    // Inject Firestore context for insights mode
    const messages = [...data.messages];
    if (data.mode === 'insights') {
      const context = await buildInsightsContext();
      messages.unshift({
        role: 'user',
        content: `Operational data (JSON):\n\`\`\`json\n${context}\n\`\`\``,
      });
    }

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

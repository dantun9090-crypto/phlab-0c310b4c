/**
 * Weekly admin briefing endpoint — invoked by the phlabs-ai-gateway Worker's
 * cron trigger (Mondays 08:00 Europe/London) or manually via the Worker's
 * /briefing route. Shared-secret auth (x-cron-secret), never public.
 *
 * Flow: compute deterministic weekly metrics from Firestore (no PII) →
 * Workers AI writes the narrative → branded HTML → Firestore `mail`
 * collection (Firebase email extension does the delivery).
 */
import { createFileRoute } from "@tanstack/react-router";
import { addDocAdmin, listDocsAdmin } from "@/lib/server/firestore-admin";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function gbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Minimal markdown → HTML for the AI narrative (bold, bullets, paragraphs). */
function mdToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = /^[-•*]\s+(.+)/.exec(line);
    if (bullet) {
      if (!inList) { out.push('<ul style="margin:8px 0;padding-left:20px;">'); inList = true; }
      out.push(`<li style="margin:4px 0;color:#1f3a54;">${inline(bullet[1])}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (!line) continue;
    const head = /^#{1,3}\s+(.+)/.exec(line);
    if (head) {
      out.push(`<p style="margin:14px 0 6px;font-weight:700;color:#0b1a30;">${inline(head[1])}</p>`);
    } else {
      out.push(`<p style="margin:8px 0;color:#1f3a54;line-height:1.55;">${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/admin/weekly-briefing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = (process.env.CRON_SECRET || "").trim();
        const provided = (request.headers.get("x-cron-secret") || "").trim();
        if (!expected || provided !== expected) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }
        const recipient = (process.env.BRIEFING_EMAIL || "info@phlabs.co.uk").trim();
        const gatewayUrl = (process.env.AI_GATEWAY_URL || "").trim();
        const gatewaySecret = (process.env.AI_GATEWAY_SECRET || "").trim();

        const now = Date.now();
        const weekStart = now - 7 * DAY_MS;
        const prevStart = now - 14 * DAY_MS;

        // ── Deterministic metrics (no PII leaves the database) ───────────
        const [orders, stock] = await Promise.all([
          listDocsAdmin("orders", { orderBy: "createdAt", limit: 100 }).catch(() => []),
          listDocsAdmin("product_stock", { limit: 200 }).catch(() => []),
        ]);

        const inWindow = (o: any, from: number, to: number) => {
          const d = parseDate(o.createdAt);
          return d !== null && d.getTime() >= from && d.getTime() < to;
        };
        const orderTotal = (o: any): number =>
          Number(o.totalAmount ?? o.totalPrice ?? o.total ?? 0) || 0;

        const thisWeek = (orders as any[]).filter((o) => inWindow(o, weekStart, now));
        const lastWeek = (orders as any[]).filter((o) => inWindow(o, prevStart, weekStart));

        const revenue = thisWeek.reduce((a, o) => a + orderTotal(o), 0);
        const prevRevenue = lastWeek.reduce((a, o) => a + orderTotal(o), 0);
        const avgOrder = thisWeek.length ? revenue / thisWeek.length : 0;

        // Top products by quantity this week
        const qty = new Map<string, number>();
        for (const o of thisWeek) {
          const items = Array.isArray(o.items) ? o.items : [];
          for (const it of items) {
            const name = String(it.productName ?? it.name ?? "unknown");
            qty.set(name, (qty.get(name) ?? 0) + (Number(it.quantity) || 0));
          }
        }
        const topProducts = [...qty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

        // Stock risk + unpaid bank transfers > 48h
        const lowStock = (stock as any[])
          .filter((p) => typeof p.stock === "number" && p.stock >= 0 && p.stock <= 5 && p.isActive !== false)
          .map((p) => ({ name: p.name ?? p.title ?? p.id, stock: p.stock }))
          .slice(0, 10);
        const staleBank = thisWeek.filter(
          (o) =>
            String(o.status ?? "").toLowerCase() === "pending" &&
            String(o.paymentMethod ?? "") === "bank_transfer" &&
            (parseDate(o.createdAt)?.getTime() ?? now) < now - 48 * 3600 * 1000,
        ).length;

        const metrics = {
          weekOf: new Date(weekStart).toISOString().slice(0, 10),
          ordersThisWeek: thisWeek.length,
          ordersPrevWeek: lastWeek.length,
          revenueThisWeek: Number(revenue.toFixed(2)),
          revenuePrevWeek: Number(prevRevenue.toFixed(2)),
          avgOrderValue: Number(avgOrder.toFixed(2)),
          topProducts: topProducts.map(([name, q]) => ({ name, qty: q })),
          lowStock,
          unpaidBankTransfersOver48h: staleBank,
        };

        // ── AI narrative via Workers AI gateway ──────────────────────────
        let narrative = "(AI narrative unavailable — metrics above are authoritative.)";
        if (gatewayUrl && gatewaySecret) {
          try {
            const r = await fetch(`${gatewayUrl}/chat`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-gateway-secret": gatewaySecret },
              body: JSON.stringify({
                system:
                  "You are the operations analyst for PH Labs, a UK research-compounds shop. " +
                  "Write a concise weekly briefing for the owner: one headline sentence, then 3-6 bullets " +
                  "covering sales trend, stock risks, and recommended actions. Be quantitative, use only the " +
                  "numbers provided, British English, no emojis.",
                messages: [
                  { role: "user", content: `Weekly metrics (JSON):\n\`\`\`json\n${JSON.stringify(metrics)}\n\`\`\`` },
                ],
              }),
            });
            const j: any = await r.json().catch(() => null);
            if (j?.ok && typeof j.text === "string" && j.text.trim()) narrative = j.text.trim();
          } catch {
            /* keep fallback narrative */
          }
        }

        // ── Branded HTML email ───────────────────────────────────────────
        const pct = (a: number, b: number) =>
          b === 0 ? "n/a" : `${a >= b ? "+" : ""}${(((a - b) / b) * 100).toFixed(0)}%`;
        const metricRow = (label: string, value: string, delta?: string) => `
          <tr>
            <td style="padding:10px 14px;color:#5a7a9a;font-size:13px;border-bottom:1px solid #eef2f6;">${label}</td>
            <td style="padding:10px 14px;color:#0b1a30;font-size:14px;font-weight:700;text-align:right;border-bottom:1px solid #eef2f6;">${value}${delta ? ` <span style="font-size:11px;color:#10b981;font-weight:600;">${delta}</span>` : ""}</td>
          </tr>`;
        const topRows = topProducts
          .map(([name, q], i) => `<tr><td style="padding:6px 14px;color:#1f3a54;font-size:13px;">${i + 1}. ${esc(name)}</td><td style="padding:6px 14px;text-align:right;font-weight:700;color:#0b1a30;font-size:13px;">${q}×</td></tr>`)
          .join("");
        const lowRows = lowStock.length
          ? lowStock.map((p) => `<tr><td style="padding:6px 14px;color:#1f3a54;font-size:13px;">${esc(String(p.name))}</td><td style="padding:6px 14px;text-align:right;font-weight:700;color:#d97706;font-size:13px;">${p.stock} left</td></tr>`).join("")
          : `<tr><td style="padding:6px 14px;color:#10b981;font-size:13px;" colspan="2">All stock levels healthy.</td></tr>`;

        const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0b1a30;padding:24px 28px;">
      <p style="margin:0;color:#34d399;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">PH Labs — Weekly Briefing</p>
      <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;">Week of ${metrics.weekOf}</h1>
    </div>
    <div style="padding:8px 14px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${metricRow("Orders", String(metrics.ordersThisWeek), `vs ${metrics.ordersPrevWeek} last week (${pct(metrics.ordersThisWeek, metrics.ordersPrevWeek)})`)}
        ${metricRow("Revenue", gbp(metrics.revenueThisWeek), `vs ${gbp(metrics.revenuePrevWeek)} (${pct(metrics.revenueThisWeek, metrics.revenuePrevWeek)})`)}
        ${metricRow("Avg. order value", gbp(metrics.avgOrderValue))}
        ${metricRow("Unpaid bank transfers >48h", String(metrics.unpaidBankTransfersOver48h))}
      </table>
    </div>
    <div style="padding:14px;">
      <p style="margin:14px 14px 4px;color:#0b1a30;font-weight:700;font-size:14px;">AI summary</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:6px 14px;">${mdToHtml(narrative)}</div>
    </div>
    <div style="padding:0 14px 6px;">
      <p style="margin:10px 14px 4px;color:#0b1a30;font-weight:700;font-size:14px;">Top products this week</p>
      <table style="width:100%;border-collapse:collapse;">${topRows || `<tr><td style="padding:6px 14px;color:#5a7a9a;font-size:13px;">No items sold this week.</td></tr>`}</table>
    </div>
    <div style="padding:0 14px 18px;">
      <p style="margin:10px 14px 4px;color:#0b1a30;font-weight:700;font-size:14px;">Low stock (≤5)</p>
      <table style="width:100%;border-collapse:collapse;">${lowRows}</table>
    </div>
    <div style="background:#f4f7fa;padding:14px 28px;text-align:center;">
      <p style="margin:0;color:#8ca3b8;font-size:11px;">Generated automatically by the PH Labs AI briefing worker · Admin use only</p>
    </div>
  </div>
</body></html>`;

        await addDocAdmin("mail", {
          to: recipient,
          message: {
            subject: `PH Labs Weekly Briefing — week of ${metrics.weekOf}`,
            html,
          },
          createdAt: new Date(),
          source: "weekly-briefing",
        });

        return json({ ok: true, sentTo: recipient, metrics });
      },
    },
  },
});

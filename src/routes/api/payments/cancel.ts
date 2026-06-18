import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/payments/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { orderId?: string } = {};
        try { body = await request.json(); } catch { /* ignore */ }
        const orderId = body?.orderId;
        if (!orderId || !/^[A-Za-z0-9_-]{3,128}$/.test(orderId)) {
          return json({ error: "Invalid orderId" }, 400);
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("wallid_payments")
          .update({ status: "CANCELLED" })
          .eq("order_id", orderId);
        return json({ ok: true });
      },
    },
  },
});

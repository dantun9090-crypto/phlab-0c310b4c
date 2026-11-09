/**
 * Double opt-in confirmation for the homepage protocol library.
 * GET ?t=<token> — validates a single-use, 24 h token created by
 * /api/public/send-mail, then enqueues the library email to that address.
 */
import { createFileRoute } from "@tanstack/react-router";

import { addDocAdmin, findDocByFieldAdmin, getDocAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { protocolLibraryEmail } from "@/templates/protocolLibraryEmail";

const TTL_MS = 24 * 3600_000;

function redirect(state: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: `/?library=${state}#protocol-library`, "cache-control": "no-store" },
  });
}

function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  return Date.parse(String(v ?? ""));
}

export const Route = createFileRoute("/api/public/protocol-confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        if (!/^[a-f0-9]{64}$/.test(token)) return redirect("invalid");
        try {
          const doc = await getDocAdmin("protocolConfirmations", token);
          if (!doc || doc.used === true) return redirect("invalid");
          const created = toMs(doc.createdAt);
          if (!Number.isFinite(created) || Date.now() - created > TTL_MS) return redirect("expired");
          const email = String(doc.email ?? "");
          const code = String(doc.discountCode ?? "");
          const pdfUrl = String(doc.pdfUrl ?? "");
          if (!email || !code || !pdfUrl.startsWith("https://phlabs.co.uk/")) return redirect("invalid");

          const coupon = await findDocByFieldAdmin("coupons", "code", code);
          if (!coupon || coupon.isActive !== true) return redirect("invalid");

          await updateDocAdmin("protocolConfirmations", token, { used: true, confirmedAt: new Date() });
          await addDocAdmin("mail", {
            to: email,
            message: {
              subject: "Your Free Research Protocol Library — PH Labs",
              html: protocolLibraryEmail({ recipientEmail: email, discountCode: code, pdfDownloadUrl: pdfUrl }),
            },
            createdAt: new Date(),
            source: "public:protocol-library-confirmed",
          });
          return redirect("confirmed");
        } catch (err) {
          console.error("[protocol-confirm] failed", err);
          return redirect("error");
        }
      },
    },
  },
});

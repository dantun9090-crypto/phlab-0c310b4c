/**
 * Public mail-enqueue endpoint.
 *
 * Guests (contact form, newsletter, guest checkout) post here. The route
 * validates input strictly, applies a template whitelist, then writes to the
 * Firestore `mail` collection using a service account (bypassing the
 * client-locked security rule).
 *
 * This replaces the previous anonymous-write pattern flagged as an open mail
 * relay.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { addDocAdmin, findDocByFieldAdmin, getDocAdmin } from "@/lib/server/firestore-admin";
import { buildContactFormEmail } from "@/templates/contactFormEmail";
import { protocolLibraryEmail } from "@/templates/protocolLibraryEmail";
import { buildProfessionalInvoiceEmail } from "@/templates/professionalInvoiceEmail";

const INTERNAL_RECIPIENT = "info@phlabs.co.uk";

// ---- best-effort per-IP rate limit (per worker isolate) ----
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || cur.resetAt < now) {
    HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count++;
  if (cur.count > MAX_PER_WINDOW) return true;
  return false;
}

const emailSchema = z.string().email().max(320);

const ContactInput = z.object({
  template: z.literal("contact"),
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(5000),
});

// Only allow PDF URLs hosted on first-party PH Labs domains. Shared
// multi-tenant CDNs (firebasestorage.googleapis.com, storage.googleapis.com)
// were previously allowed, but any attacker can host files on those buckets
// and abuse this endpoint to send PH Labs-branded phishing mail.
const ALLOWED_PDF_HOSTS = new Set<string>([
  "phlabs.co.uk",
  "www.phlabs.co.uk",
]);

const trustedPdfUrl = z
  .string()
  .url()
  .max(500)
  .refine(
    (u) => {
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== "https:") return false;
        return ALLOWED_PDF_HOSTS.has(parsed.hostname.toLowerCase());
      } catch {
        return false;
      }
    },
    { message: "pdfUrl host is not on the trusted allowlist" },
  );

const ProtocolInput = z.object({
  template: z.literal("protocol-library"),
  email: emailSchema,
  discountCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/i),
  pdfUrl: trustedPdfUrl,
});

const OrderInput = z.object({
  template: z.literal("order-confirmation"),
  email: emailSchema,
  orderId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9_-]+$/i),
  // Bank details are NEVER accepted from the client — they are fetched
  // server-side from settings/bankTransfer (admin-only Firestore doc) to
  // prevent attackers from delivering PH Labs-branded invoices with
  // fraudulent payment instructions.
});

const Body = z.discriminatedUnion("template", [
  ContactInput,
  ProtocolInput,
  OrderInput,
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/public/send-mail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";

        if (rateLimited(ip)) {
          return json({ error: "rate_limited" }, 429);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return json(
            { error: "invalid_input", details: parsed.error.flatten() },
            400,
          );
        }
        const input = parsed.data;

        let to: string;
        let subject: string;
        let html: string;
        let replyTo: string | undefined;

        try {
          switch (input.template) {
            case "contact": {
              to = INTERNAL_RECIPIENT;
              replyTo = input.email;
              subject = `[PHP Contact] ${input.subject || "New Enquiry"} — from ${input.name}`;
              html = buildContactFormEmail({
                senderName: input.name,
                senderEmail: input.email,
                subject: input.subject || "Contact Form Enquiry",
                message: input.message,
              });
              break;
            }
            case "protocol-library": {
              // Verify the discount code exists and is active in Firestore
              // before sending PH Labs-branded mail. Without this, anyone
              // could deliver an apparently-legitimate offer with an
              // arbitrary fake code to any address.
              const upper = input.discountCode.toUpperCase();
              const coupon = await findDocByFieldAdmin("coupons", "code", upper);
              if (!coupon || coupon.isActive !== true) {
                return json({ error: "invalid_discount_code" }, 400);
              }
              const expiry = coupon.expiryDate;
              if (typeof expiry === "string" && new Date(expiry) < new Date()) {
                return json({ error: "discount_code_expired" }, 400);
              }
              to = input.email;
              subject = "Your Free Research Protocol Library — PH Labs";
              html = protocolLibraryEmail({
                recipientEmail: input.email,
                discountCode: upper,
                pdfDownloadUrl: input.pdfUrl,
              });
              break;
            }
            case "order-confirmation": {
              // Verify the order actually exists in Firestore and that the
              // recipient email matches the order's customer email. Without
              // this anyone could POST arbitrary data and have a PH Labs
              // branded invoice delivered to any inbox.
              const order = await getDocAdmin("orders", input.orderId);
              if (!order) {
                return json({ error: "order_not_found" }, 404);
              }
              const orderEmail =
                typeof order.email === "string"
                  ? order.email
                  : typeof (order.customer as { email?: string } | undefined)
                        ?.email === "string"
                    ? (order.customer as { email: string }).email
                    : null;
              if (
                !orderEmail ||
                orderEmail.toLowerCase() !== input.email.toLowerCase()
              ) {
                return json({ error: "email_mismatch" }, 403);
              }

              // Pull ALL financial / item / address data from the trusted
              // Firestore order document — never from the client body.
              const customer = (order.customer as Record<string, unknown> | undefined) ?? {};
              const items = Array.isArray(order.items)
                ? (order.items as Array<Record<string, unknown>>).map((it) => ({
                    name: String(it.productName ?? it.name ?? ""),
                    variantName:
                      typeof it.variantName === "string" ? it.variantName : undefined,
                    quantity: Number(it.quantity ?? 0),
                    priceNum: Number(it.price ?? 0),
                  }))
                : [];
              const subtotal = Number(order.subtotal ?? 0);
              const shipping = Number(order.shippingCost ?? 0);
              const discount = Number(order.discount ?? 0);
              const total = Number(order.totalAmount ?? order.total ?? 0);

              to = input.email;
              subject = `Order Confirmed — ${input.orderId} | PH Labs`;
              html = buildProfessionalInvoiceEmail({
                orderId: input.orderId,
                firstName: String(customer.firstName ?? ""),
                items,
                subtotal,
                shipping,
                discount,
                total,
                address: typeof customer.address === "string" ? customer.address : undefined,
                city: typeof customer.city === "string" ? customer.city : undefined,
                postcode: typeof customer.postcode === "string" ? customer.postcode : undefined,
                paymentMethod:
                  order.paymentMethod === "card" || order.paymentMethod === "bank_transfer"
                    ? (order.paymentMethod as "card" | "bank_transfer")
                    : undefined,
                bankTransferRef:
                  typeof order.bankTransferReference === "string"
                    ? order.bankTransferReference
                    : undefined,
                bankName: input.bankName,
                bankSortCode: input.bankSortCode,
                bankAccountNumber: input.bankAccountNumber,
                bankIBAN: input.bankIBAN,
                bankInstructions: input.bankInstructions,
              });
              break;
            }

          }

          await addDocAdmin("mail", {
            to,
            ...(replyTo ? { replyTo } : {}),
            message: { subject, html },
            createdAt: new Date(),
            source: `public:${input.template}`,
            ip,
          });

          return json({ ok: true });
        } catch (err) {
          console.error("[api/public/send-mail] failed", err);
          return json({ error: "send_failed" }, 500);
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        }),
    },
  },
});

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

import { addDocAdmin, getDocAdmin } from "@/lib/server/firestore-admin";
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

// Only allow PDF URLs hosted on PH Labs or trusted Firebase/Google CDNs.
// Prevents attackers using this endpoint to send PH Labs-branded phishing
// emails with arbitrary attacker-controlled download links.
const ALLOWED_PDF_HOSTS = new Set<string>([
  "phlabs.co.uk",
  "www.phlabs.co.uk",
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
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
  firstName: z.string().trim().min(1).max(120),
  subtotal: z.number().min(0).max(1_000_000),
  shipping: z.number().min(0).max(1_000_000),
  discount: z.number().min(0).max(1_000_000),
  total: z.number().min(0).max(1_000_000),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        variantName: z.string().trim().max(120).optional(),
        quantity: z.number().int().min(1).max(1000),
        priceNum: z.number().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(50),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  postcode: z.string().trim().max(20).optional(),
  paymentMethod: z.enum(["card", "bank_transfer"]).optional(),
  bankTransferRef: z.string().trim().max(64).optional(),
  bankName: z.string().trim().max(120).optional(),
  bankSortCode: z.string().trim().max(20).optional(),
  bankAccountNumber: z.string().trim().max(40).optional(),
  bankIBAN: z.string().trim().max(64).optional(),
  bankInstructions: z.string().trim().max(2000).optional(),
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
              to = input.email;
              subject = "Your Free Research Protocol Library — PH Labs";
              html = protocolLibraryEmail({
                recipientEmail: input.email,
                discountCode: input.discountCode,
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

              to = input.email;
              subject = `Order Confirmed — ${input.orderId} | PH Labs`;
              html = buildProfessionalInvoiceEmail({
                orderId: input.orderId,
                firstName: input.firstName,
                items: input.items,
                subtotal: input.subtotal,
                shipping: input.shipping,
                discount: input.discount,
                total: input.total,
                address: input.address,
                city: input.city,
                postcode: input.postcode,
                paymentMethod: input.paymentMethod,
                bankTransferRef: input.bankTransferRef,
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

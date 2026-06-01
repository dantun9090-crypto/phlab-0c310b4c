/**
 * Admin-only test mail trigger.
 *
 * Enqueues a doc into the Firestore `mail` collection (the same path the
 * contact form uses). The Firebase Trigger Email extension picks it up and
 * sends via the SMTP credentials configured on the extension
 * (cPanel: smtps://info%40phlabs.co.uk@mail.phlabs.co.uk:465).
 *
 * If the email never arrives, the problem is NOT in the website code —
 * it's the extension's SMTP_CONNECTION_URI or the mail server itself.
 * Check Admin → Mail Health for delivery events.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addDocAdmin } from "@/lib/server/firestore-admin";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  to: z.string().email().max(320).optional(),
});

export const sendTestMail = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const to = data.to || "dantun90@hotmail.com";
    const ts = new Date().toISOString();
    const subject = `PH Labs Test - ${ts}`;

    try {
      const res = await addDocAdmin("mail", {
        to,
        message: {
          subject,
          html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a">
            <h2 style="color:#10b981">PH Labs SMTP test</h2>
            <p>This is an automated deliverability test sent from the admin panel.</p>
            <p><strong>Timestamp:</strong> ${ts}</p>
            <p><strong>Recipient:</strong> ${to}</p>
            <p>If you received this, the Firestore <code>mail</code> queue + Firebase
            Trigger Email extension + cPanel SMTP are working end-to-end.</p>
          </body></html>`,
          text: `PH Labs SMTP test\nTimestamp: ${ts}\nRecipient: ${to}\n`,
        },
        createdAt: new Date(),
        source: "admin:test-mail",
      });
      const docId = res.name.split("/").pop() ?? res.name;
      return { ok: true as const, id: docId, to, subject };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: msg, to, subject };
    }
  });

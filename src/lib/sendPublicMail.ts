/**
 * Client helper to enqueue mail via the server endpoint.
 * Guests can call this safely — server validates input and writes to
 * Firestore using a service-account credential.
 */
export type SendMailInput =
  | {
      template: "contact";
      name: string;
      email: string;
      subject?: string;
      message: string;
    }
  | {
      template: "protocol-library";
      email: string;
      discountCode: string;
      pdfUrl: string;
    }
  | {
      template: "order-confirmation";
      email: string;
      orderId: string;
      firstName: string;
      subtotal: number;
      shipping: number;
      discount: number;
      total: number;
      items: Array<{
        name: string;
        variantName?: string;
        quantity: number;
        priceNum: number;
      }>;
      address?: string;
      city?: string;
      postcode?: string;
      paymentMethod?: "card" | "bank_transfer";
      bankTransferRef?: string;
      bankName?: string;
      bankSortCode?: string;
      bankAccountNumber?: string;
      bankIBAN?: string;
      bankInstructions?: string;
    };

export async function sendPublicMail(input: SendMailInput): Promise<boolean> {
  try {
    const res = await fetch("/api/public/send-mail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return res.ok;
  } catch (err) {
    console.warn("[sendPublicMail] failed", err);
    return false;
  }
}

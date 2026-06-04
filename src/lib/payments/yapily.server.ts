/**
 * Yapily adapter — placeholder.
 *
 * Yapily integration is "pending" until the user is approved and supplies
 * YAPILY_APPLICATION_ID / YAPILY_APPLICATION_SECRET. The adapter throws a
 * descriptive error from every operation so the dispatcher cleanly falls
 * back to the next gateway, and the admin panel renders the row as
 * `status: "pending"` with the toggle disabled.
 *
 * NEVER import from client code.
 */

export async function yapilyTestConnection(): Promise<never> {
  throw new Error("Yapily not configured — awaiting application approval");
}

export async function yapilyCreatePayment(): Promise<never> {
  throw new Error("Yapily not configured — please use a different gateway");
}

export function yapilyConfigured(): boolean {
  return Boolean(process.env.YAPILY_APPLICATION_ID && process.env.YAPILY_APPLICATION_SECRET);
}

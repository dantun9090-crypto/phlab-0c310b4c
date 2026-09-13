/**
 * Orders placed at guest checkout that belong to a signed-in customer.
 *
 * Ownership of an order stays with the verified Firebase UID recorded at
 * creation time (see create-order.server.ts) — a typed email never transfers
 * ownership. But a customer who checked out as a guest (or whose anonymous
 * sign-in failed) still expects those orders in their account history.
 *
 * This server function resolves that read-only view safely:
 *   1. the caller's ID token signature is verified,
 *   2. Identity Toolkit confirms the email is VERIFIED for that account,
 *   3. only orders whose customer email equals that verified email are read.
 *
 * An unverified email returns nothing, so an attacker cannot register a
 * stranger's address and read their order history.
 */
import { createServerFn } from '@tanstack/react-start';

/** Public Firebase Web API key (safe in client bundles / not a secret). */
const FIREBASE_WEB_API_KEY = 'AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM';

export interface GuestOrdersResult {
  ok: boolean;
  /** Orders matched by verified email that are not already owned by this UID. */
  orders: Array<Record<string, unknown> & { id: string }>;
}

export const getOrdersForVerifiedEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== 'string' || data.idToken.length > 4096) {
      throw new Error('idToken required');
    }
    return data;
  })
  .handler(async ({ data }): Promise<GuestOrdersResult> => {
    try {
      const { verifyFirebaseIdToken } = await import('@/lib/server/firebase-auth-admin');
      const verified = await verifyFirebaseIdToken(data.idToken);
      const uid = verified.uid;
      if (!uid) return { ok: false, orders: [] };

      // Email ownership must be proven, not merely claimed.
      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken: data.idToken }),
        },
      );
      if (!lookupRes.ok) return { ok: false, orders: [] };
      const lookup = (await lookupRes.json()) as {
        users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
      };
      const account = lookup.users?.[0];
      if (!account || account.localId !== uid || account.emailVerified !== true) {
        return { ok: true, orders: [] };
      }

      const email = (account.email || '').trim();
      if (!email) return { ok: true, orders: [] };

      const { listDocsAdmin } = await import('@/lib/server/firestore-admin');
      // Most rows store the address lowercased; a few older ones keep the
      // typed casing, so try both spellings.
      const variants = [...new Set([email.toLowerCase(), email])];
      const found = new Map<string, Record<string, unknown> & { id: string }>();
      for (const value of variants) {
        for (const field of ['customer.email', 'userEmail']) {
          const rows = await listDocsAdmin('orders', {
            where: { field, value },
            limit: 100,
          }).catch(() => []);
          for (const row of rows) {
            if (row.userId && row.userId === uid) continue; // already in history
            if (row.id.startsWith('test-')) continue;
            found.set(row.id, row);
          }
        }
      }

      return { ok: true, orders: [...found.values()] };
    } catch {
      // Never break the account page over this convenience lookup.
      return { ok: false, orders: [] };
    }
  });

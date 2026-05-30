/**
 * Server-side Firebase Auth ID-token verification + admin gate.
 *
 * Uses the Identity Toolkit REST endpoint to validate a caller-supplied
 * Firebase ID token (cryptographically verified by Google), then looks up
 * the matching `customers/{uid}` document via the service account to
 * confirm `isAdmin === true`.
 *
 * Use ONLY from server routes / server functions.
 */
import { getDocAdmin } from "./firestore-admin";

// Public Firebase Web API key. Same value already shipped in the client
// bundle (src/lib/firebase.ts); safe to embed here for the lookup call.
const FIREBASE_API_KEY = "AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM";
const LOOKUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;

export interface VerifiedUser {
  uid: string;
  email: string | null;
}

/**
 * Verify a Firebase ID token. Returns the user's uid+email on success,
 * throws on any failure (invalid signature, expired, unknown user, etc.).
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedUser> {
  if (!idToken || typeof idToken !== "string" || idToken.length > 4096) {
    throw new Error("invalid_id_token");
  }
  const res = await fetch(LOOKUP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error(`id_token_rejected_${res.status}`);
  const data = (await res.json()) as {
    users?: Array<{ localId: string; email?: string }>;
  };
  const u = data.users?.[0];
  if (!u?.localId) throw new Error("id_token_no_user");
  return { uid: u.localId, email: u.email ?? null };
}

/**
 * Verify an ID token AND confirm the user has `isAdmin: true` on their
 * `customers/{uid}` document. Throws on any failure.
 */
export async function requireFirebaseAdmin(idToken: string): Promise<VerifiedUser> {
  const user = await verifyFirebaseIdToken(idToken);
  const doc = await getDocAdmin("customers", user.uid);
  if (!doc || doc.isAdmin !== true) {
    throw new Error("not_admin");
  }
  return user;
}

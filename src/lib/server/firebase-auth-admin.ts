/**
 * Server-side Firebase Auth ID-token verification + admin gate.
 *
 * Verifies the caller-supplied Firebase ID token LOCALLY: the RS256
 * signature is checked against Google's public securetoken keys (JWKS),
 * plus iss/aud/exp/iat claims. No API key is involved, so this keeps
 * working now that the browser API key is restricted by HTTP referrer
 * (server-side calls carry no Referer and were getting 403 from the
 * Identity Toolkit accounts:lookup endpoint → `id_token_rejected_403`).
 *
 * Web Crypto only — Cloudflare Workers compatible, no firebase-admin.
 *
 * Use ONLY from server routes / server functions.
 */
import { getDocAdmin, getServiceAccount } from "./firestore-admin";

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface VerifiedUser {
  uid: string;
  email: string | null;
}

// ---- base64url helpers ----
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson<T>(b64url: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url))) as T;
}

// ---- Google securetoken public keys (JWKS), cached per cache-control ----
let cachedKeys: { keys: Map<string, CryptoKey>; expiresAt: number } | null = null;

async function getPublicKeys(): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt - 60_000 > now) return cachedKeys.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`jwks_fetch_failed_${res.status}`);
  const jwks = (await res.json()) as {
    keys: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }>;
  };

  // Honour Google's cache-control max-age (keys rotate ~every few weeks).
  let maxAgeSec = 3600;
  const cc = res.headers.get("cache-control") ?? "";
  const m = /max-age=(\d+)/.exec(cc);
  if (m) maxAgeSec = Math.min(Number(m[1]), 86_400);

  const keys = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys ?? []) {
    if (!jwk.kid) continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      { ...jwk, ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keys.set(jwk.kid, key);
  }
  cachedKeys = { keys, expiresAt: now + maxAgeSec * 1000 };
  return keys;
}

function getProjectId(): string {
  // Prefer the service-account project id; fall back to the known project.
  try {
    return getServiceAccount().project_id;
  } catch {
    return "prohealthpeptides-a0808";
  }
}

/**
 * Verify a Firebase ID token. Returns the user's uid+email on success,
 * throws on any failure (invalid signature, expired, unknown user, etc.).
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedUser> {
  if (!idToken || typeof idToken !== "string" || idToken.length > 4096) {
    throw new Error("invalid_id_token");
  }
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token_rejected_400");
  const [h, p, s] = parts;

  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    email?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
  };
  try {
    header = decodeJson(h);
    payload = decodeJson(p);
  } catch {
    throw new Error("id_token_rejected_400");
  }

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("id_token_rejected_400");
  }

  // Claims checks (same rules as firebase-admin verifyIdToken).
  const projectId = getProjectId();
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error("id_token_rejected_400");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("id_token_rejected_400");
  }
  if (!payload.sub || payload.sub.length > 128) throw new Error("id_token_no_user");
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new Error("id_token_rejected_400");
  }
  if (typeof payload.iat !== "number" || payload.iat > nowSec + 300) {
    throw new Error("id_token_rejected_400");
  }

  // Signature check against Google's securetoken JWKS.
  const keys = await getPublicKeys();
  let key = keys.get(header.kid);
  if (!key) {
    // Key rotation race: force-refresh once before giving up.
    cachedKeys = null;
    key = (await getPublicKeys()).get(header.kid);
    if (!key) throw new Error("id_token_rejected_400");
  }
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(s) as unknown as ArrayBuffer,
    new TextEncoder().encode(`${h}.${p}`) as unknown as ArrayBuffer,
  );
  if (!ok) throw new Error("id_token_rejected_400");

  return { uid: payload.sub, email: payload.email ?? null };
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

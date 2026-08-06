/**
 * Server-only Firebase Auth admin deletion.
 *
 * Mints a service-account access token with the Identity Toolkit scope and
 * deletes the Auth account for a uid. Web Crypto only (Cloudflare Workers
 * compatible) — never import from client code.
 *
 * The caller MUST have already verified that the requester is an admin.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedAccount: ServiceAccount | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount {
  if (cachedAccount) return cachedAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  cachedAccount = JSON.parse(raw) as ServiceAccount;
  return cachedAccount;
}

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getIdentityAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const acct = getServiceAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: acct.client_email,
    scope: IDENTITY_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(acct.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Identity token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

export interface DeleteAuthUserResult {
  deleted: boolean;
  /** True when the Auth account did not exist (already gone). */
  missing: boolean;
}

/** Permanently delete the Firebase Auth account for `uid`. */
export async function deleteAuthUserAdmin(uid: string): Promise<DeleteAuthUserResult> {
  const acct = getServiceAccount();
  const token = await getIdentityAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${acct.project_id}/accounts:delete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ localId: uid }),
    },
  );

  if (res.ok) return { deleted: true, missing: false };

  const text = await res.text();
  if (/USER_NOT_FOUND/i.test(text) || res.status === 404) {
    return { deleted: false, missing: true };
  }
  console.error("[auth-delete] failed", { status: res.status });
  throw new Error("auth_delete_failed");
}

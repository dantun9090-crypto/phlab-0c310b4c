/**
 * Server-only Firebase Auth password helpers (admin use).
 *
 * Two operations, both performed with service-account credentials via the
 * Identity Toolkit REST API (Web Crypto only — Cloudflare Workers safe):
 *
 *   - `setAuthUserPassword`   : set a new password for a uid and revoke all
 *                               existing sessions (validSince bump).
 *   - `sendPasswordResetLink` : ask Identity Toolkit to email the customer a
 *                               password-reset link.
 *
 * The caller MUST have already verified that the requester is an admin.
 * Passwords are never logged or persisted by these helpers.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";
const FIREBASE_WEB_API_KEY = "AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM";
const OOB_ENDPOINT = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_WEB_API_KEY}`;

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
    new TextEncoder().encode(signingInput) as unknown as ArrayBuffer,
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

/**
 * A readable temporary password: `Lab-4821-Peptide` style. Uses crypto
 * randomness, avoids ambiguous characters, and is long enough to satisfy the
 * project password policy comfortably.
 */
const WORDS_A = ["Lab", "Assay", "Bench", "Vial", "Buffer", "Batch", "Flask", "Purity"];
const WORDS_B = ["Peptide", "Sample", "Protocol", "Reagent", "Fraction", "Column", "Solvent"];

export function generateReadablePassword(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const a = WORDS_A[bytes[0] % WORDS_A.length];
  const b = WORDS_B[bytes[1] % WORDS_B.length];
  const digits = String(((bytes[2] << 8) | bytes[3]) % 9000 + 1000);
  return `${a}-${digits}-${b}`;
}

/**
 * Set a new password for `uid` and revoke every existing session so the old
 * credentials (and any stolen refresh token) stop working immediately.
 */
export async function setAuthUserPassword(uid: string, password: string): Promise<void> {
  const acct = getServiceAccount();
  const token = await getIdentityAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${acct.project_id}/accounts:update`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        localId: uid,
        password,
        // Invalidate all outstanding refresh tokens for this user.
        validSince: String(Math.floor(Date.now() / 1000)),
      }),
    },
  );
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  if (/USER_NOT_FOUND/i.test(text) || res.status === 404) throw new Error("auth_user_not_found");
  if (/WEAK_PASSWORD/i.test(text)) throw new Error("weak_password");
  console.error("[auth-password] set failed", { status: res.status });
  throw new Error("password_update_failed");
}

/**
 * Trigger Firebase's own password-reset email for `email`.
 *
 * The browser API key is restricted by HTTP referrer, so a server-side fetch
 * must carry the canonical site referer/origin or Identity Toolkit answers
 * 403 API_KEY_HTTP_REFERRER_BLOCKED and no email is sent (same fix as
 * src/lib/auth-throttle.functions.ts).
 */
export async function sendPasswordResetLink(
  email: string,
  continueUrl = "https://phlabs.co.uk/login",
): Promise<void> {
  const res = await fetch(OOB_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      referer: "https://phlabs.co.uk/login",
      origin: "https://phlabs.co.uk",
    },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email, continueUrl }),
  });
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  if (/EMAIL_NOT_FOUND/i.test(text)) throw new Error("auth_user_not_found");
  console.error("[auth-password] reset link failed", { status: res.status });
  throw new Error("reset_link_failed");
}

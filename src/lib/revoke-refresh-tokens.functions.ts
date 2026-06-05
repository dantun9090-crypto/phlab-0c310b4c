/**
 * Server-side helper to revoke a user's refresh tokens via the Identity
 * Toolkit REST API. This forces sign-out on every OTHER device — the current
 * session can continue because the in-memory ID token is still valid until
 * its 1-hour expiry; the next refresh attempt fails and forces re-auth.
 *
 * Used after a successful password change (item G of the security hardening).
 */
import { createServerFn } from '@tanstack/react-start';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

let cached: { token: string; expiresAt: number } | null = null;

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not configured');
  const acct = JSON.parse(raw) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - 60 > now) {
    return { token: cached.token, projectId: acct.project_id };
  }
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: acct.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(acct.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`OAuth exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: now + data.expires_in };
  return { token: data.access_token, projectId: acct.project_id };
}

/**
 * Revoke all refresh tokens for a Firebase Auth user.
 * Internally sets the user's `validSince` to "now" via the Identity Toolkit
 * `accounts:update` REST endpoint — equivalent to admin.auth().revokeRefreshTokens(uid).
 *
 * Callers must provide a verified Firebase ID token belonging to the same user
 * (so we cannot be used to log out arbitrary accounts from the public internet).
 */
export const revokeMyRefreshTokens = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== 'string' || data.idToken.length > 4000) {
      throw new Error('idToken required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // unused, just a guard
    void apiKey;

    // 1) Look up the caller's UID using the provided ID token via the public
    //    Identity Toolkit endpoint. This verifies token validity.
    const FIREBASE_API_KEY = 'AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM'; // public Web API key
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken: data.idToken }),
      },
    );
    if (!lookupRes.ok) {
      throw new Error('Invalid ID token');
    }
    const lookup = (await lookupRes.json()) as { users?: Array<{ localId: string }> };
    const uid = lookup.users?.[0]?.localId;
    if (!uid) throw new Error('User not found');

    // 2) Use service-account credentials to revoke tokens by setting validSince.
    const { token, projectId } = await getAccessToken();
    const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ localId: uid, validSince: String(Math.floor(Date.now() / 1000)) }),
    });
    if (!res.ok) {
      throw new Error(`Revoke failed: ${res.status}`);
    }
    return { ok: true, uid };
  });

/**
 * Server-only Firebase Storage uploader using the Google Cloud Storage JSON API.
 *
 * This bypasses client Storage rules only after a separate admin auth check has
 * passed in the calling server function. Never import this from client code.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STORAGE_SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface UploadStorageImageInput {
  base64: string;
  contentType: string;
  productId: string;
  variantIndex: number;
}

interface UploadStorageImageResult {
  url: string;
  path: string;
  size: number;
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

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const acct = getServiceAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: acct.client_email,
    scope: STORAGE_SCOPE,
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
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Storage token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

function base64ToBytes(input: string): Uint8Array {
  const raw = input.includes(",") ? input.split(",").pop() || "" : input;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "product";
}

function extFromContentType(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/avif") return "avif";
  return "webp";
}

export async function uploadHplcStorageImage(input: UploadStorageImageInput): Promise<UploadStorageImageResult> {
  const contentType = input.contentType || "image/webp";
  if (!contentType.startsWith("image/")) throw new Error("invalid_image_type");

  const bytes = base64ToBytes(input.base64);
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error("invalid_image_size");

  const acct = getServiceAccount();
  const token = await getAccessToken();
  const bucket = `${acct.project_id}.firebasestorage.app`;
  const downloadToken = crypto.randomUUID();
  const variant = Number.isFinite(input.variantIndex) ? Math.max(0, Math.min(99, Math.floor(input.variantIndex))) : 0;
  const path = `products/${safeId(input.productId)}/images/hplc-${variant}-${Date.now()}.${extFromContentType(contentType)}`;

  const boundary = `phlabs-${crypto.randomUUID()}`;
  const metadata = {
    name: path,
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  };
  const fileBytes = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(fileBytes).set(bytes);
  const body = new Blob([
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\ncontent-type: ${contentType}\r\n\r\n`,
    fileBytes,
    `\r\n--${boundary}--`,
  ]);

  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);

  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`,
    path,
    size: bytes.byteLength,
  };
}
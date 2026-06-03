/**
 * Server-only Firestore writer using a Google service account.
 *
 * Signs an RS256 JWT with Web Crypto (Cloudflare Workers compatible — no
 * firebase-admin / node-grpc) and exchanges it for an OAuth2 access token
 * with the Firestore Data scope, then writes via the Firestore REST API.
 *
 * Use ONLY from server routes / server functions. NEVER import client-side.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedAccount: ServiceAccount | null = null;

function getServiceAccount(): ServiceAccount {
  if (cachedAccount) return cachedAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  cachedAccount = JSON.parse(raw) as ServiceAccount;
  return cachedAccount;
}

function b64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
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
    scope: SCOPE,
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
  if (!res.ok) {
    throw new Error(`OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

// ---- Firestore REST value encoding ----
function toFirestoreValue(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFirestoreValue) } };
  }
  if (typeof v === "object") {
    const fields: Record<string, any> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function objectToFields(obj: Record<string, unknown>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return fields;
}

/**
 * Create a document in the given collection. Uses service-account credentials
 * (bypasses Firestore security rules).
 */
export async function addDocAdmin(
  collection: string,
  data: Record<string, unknown>,
  id?: string,
): Promise<{ name: string }> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const qs = id ? `?documentId=${encodeURIComponent(id)}` : "";
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/${encodeURIComponent(collection)}${qs}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fields: objectToFields(data) }),
  });
  if (!res.ok) {
    throw new Error(`Firestore write failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { name: string };
}

/**
 * Patch fields on an existing document. Only the provided fields are
 * updated (Firestore REST `updateMask.fieldPaths`); other fields are left
 * untouched. Bypasses security rules — server-only.
 */
export async function updateDocAdmin(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const fieldPaths = Object.keys(data);
  if (fieldPaths.length === 0) return;
  const mask = fieldPaths
    .map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`)
    .join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${mask}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fields: objectToFields(data) }),
  });
  if (!res.ok) {
    throw new Error(`Firestore update failed: ${res.status} ${await res.text()}`);
  }
}

// ---- Firestore REST value decoding ----
function fromFirestoreValue(v: any): unknown {
  if (!v || typeof v !== "object") return v;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    return (v.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in v) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      out[k] = fromFirestoreValue(val);
    }
    return out;
  }
  return undefined;
}

/**
 * Fetch a single document from Firestore by collection + id using the
 * service account. Returns `null` if the document does not exist.
 */
export async function getDocAdmin(
  collection: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Firestore read failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { fields?: Record<string, any> };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data.fields || {})) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

/**
 * List recent documents from a collection using service-account credentials.
 * Intended for admin-only diagnostic panels where client SDK reads can be
 * blocked by production Firestore rules or delayed rule deployment.
 */
export async function listDocsAdmin(
  collection: string,
  options: { orderBy?: string; direction?: "ASCENDING" | "DESCENDING"; limit?: number } = {},
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:runQuery`;
  const body: Record<string, unknown> = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      orderBy: options.orderBy
        ? [{ field: { fieldPath: options.orderBy }, direction: options.direction ?? "DESCENDING" }]
        : undefined,
      limit: Math.min(Math.max(options.limit ?? 50, 1), 100),
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Firestore list failed: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, any> };
  }>;
  return rows.flatMap((r) => {
    if (!r.document) return [];
    const out: Record<string, unknown> & { id: string } = {
      id: r.document.name.split("/").pop() ?? "",
    };
    for (const [k, v] of Object.entries(r.document.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return [out];
  });
}

/**
 * Run a single-field equality query against a collection and return the
 * first matching document (or null). Useful for "look up by code" style
 * checks (promo codes, coupons, etc.) from server routes.
 */
export async function findDocByFieldAdmin(
  collection: string,
  field: string,
  value: string | number | boolean,
): Promise<Record<string, unknown> | null> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:runQuery`;
  const fsValue =
    typeof value === "string"
      ? { stringValue: value }
      : typeof value === "number"
        ? { doubleValue: value }
        : { booleanValue: value };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: fsValue,
          },
        },
        limit: 1,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Firestore query failed: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, any> };
  }>;
  const docRow = rows.find((r) => r.document)?.document;
  if (!docRow) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(docRow.fields || {})) {
    out[k] = fromFirestoreValue(v);
  }
  // `docRow.name` is `projects/.../documents/<collection>/<docId>` —
  // expose the trailing doc id so callers can patch the same row.
  const parts = docRow.name.split("/");
  out.__id = parts[parts.length - 1];
  return out;
}


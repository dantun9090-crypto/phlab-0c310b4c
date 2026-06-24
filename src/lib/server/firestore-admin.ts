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
  options: {
    orderBy?: string;
    direction?: "ASCENDING" | "DESCENDING";
    limit?: number;
    /** Cursor value (matches the orderBy field). Returns rows AFTER this value (exclusive). */
    startAfter?: string | number | boolean | Date;
    /** Optional single-field equality filter. */
    where?: { field: string; op?: "EQUAL"; value: string | number | boolean };
    /** Optional range filter on a single field (e.g. a timestamp window). */
    rangeFilter?: {
      field: string;
      gte?: string | number | boolean | Date;
      lte?: string | number | boolean | Date;
    };
  } = {},
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents:runQuery`;
  const structured: Record<string, unknown> = {
    from: [{ collectionId: collection }],
    limit: Math.min(Math.max(options.limit ?? 50, 1), 50_000),
  };
  if (options.orderBy) {
    structured.orderBy = [
      { field: { fieldPath: options.orderBy }, direction: options.direction ?? "DESCENDING" },
    ];
  }
  const filters: Array<Record<string, unknown>> = [];
  if (options.where) {
    filters.push({
      fieldFilter: {
        field: { fieldPath: options.where.field },
        op: options.where.op ?? "EQUAL",
        value: toFirestoreValue(options.where.value),
      },
    });
  }
  if (options.rangeFilter) {
    const f = options.rangeFilter;
    if (f.gte !== undefined) {
      filters.push({
        fieldFilter: {
          field: { fieldPath: f.field },
          op: "GREATER_THAN_OR_EQUAL",
          value: toFirestoreValue(f.gte),
        },
      });
    }
    if (f.lte !== undefined) {
      filters.push({
        fieldFilter: {
          field: { fieldPath: f.field },
          op: "LESS_THAN_OR_EQUAL",
          value: toFirestoreValue(f.lte),
        },
      });
    }
  }
  if (filters.length === 1) {
    structured.where = filters[0];
  } else if (filters.length > 1) {
    structured.where = { compositeFilter: { op: "AND", filters } };
  }
  if (options.startAfter !== undefined && options.orderBy) {
    structured.startAt = {
      values: [toFirestoreValue(options.startAfter)],
      before: false,
    };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ structuredQuery: structured }),
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
 * Delete a document by collection + id. Bypasses security rules.
 */
export async function deleteDocAdmin(collection: string, id: string): Promise<void> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore delete failed: ${res.status} ${await res.text()}`);
  }
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


/**
 * Atomically transition a document's `status` field using a Firestore
 * read-write transaction. Use this for webhook handlers where two concurrent
 * deliveries (provider retry storm, dashboard "Resend", race between webhook
 * + status poll + reconcile cron) would otherwise both observe the same
 * "pending" status, both fire the update, and both trigger side effects.
 *
 * Semantics:
 *   - Begin a readWrite transaction.
 *   - Read the doc inside the transaction (snapshot-isolated).
 *   - If the doc is missing → rollback, return { transitioned:false, prior:null }.
 *   - If current lowercased `status` ∉ allowFrom → rollback, return
 *     { transitioned:false, prior } (caller can decide to no-op).
 *   - Otherwise commit the `updates` patch with the transaction id —
 *     Firestore guarantees no other commit landed on this doc between read
 *     and commit; concurrent transitions get ABORTED and fall through to
 *     the not-transitioned branch.
 *
 * Returns the PRIOR document (pre-update) so callers can read customer
 * fields for email fan-out without a second round trip.
 */
export async function transitionDocStatusAdmin(
  collection: string,
  id: string,
  opts: {
    allowFrom: string[]; // lowercased statuses that may be transitioned
    updates: Record<string, unknown>; // must include `status` if changing
  },
): Promise<{ transitioned: boolean; prior: Record<string, unknown> | null }> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const base = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents`;
  const docPath = `${base}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  const fullName = `projects/${acct.project_id}/databases/(default)/documents/${collection}/${id}`;

  // 1) Begin transaction.
  const beginRes = await fetch(`${base}:beginTransaction`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  if (!beginRes.ok) {
    throw new Error(`Firestore beginTransaction failed: ${beginRes.status} ${await beginRes.text()}`);
  }
  const { transaction } = (await beginRes.json()) as { transaction: string };

  const rollback = async () => {
    try {
      await fetch(`${base}:rollback`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ transaction }),
      });
    } catch { /* best effort */ }
  };

  // 2) Read doc inside the transaction.
  const readRes = await fetch(`${docPath}?transaction=${encodeURIComponent(transaction)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (readRes.status === 404) {
    await rollback();
    return { transitioned: false, prior: null };
  }
  if (!readRes.ok) {
    await rollback();
    throw new Error(`Firestore tx read failed: ${readRes.status} ${await readRes.text()}`);
  }
  const docJson = (await readRes.json()) as { fields?: Record<string, any> };
  const prior: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(docJson.fields || {})) prior[k] = fromFirestoreValue(v);

  const priorStatus = String(prior.status ?? "").toLowerCase();
  const allow = opts.allowFrom.map((s) => s.toLowerCase());
  if (!allow.includes(priorStatus)) {
    await rollback();
    return { transitioned: false, prior };
  }

  // 3) Commit the patch atomically. We use `update` + `updateMask` so other
  //    fields stay intact — same semantics as updateDocAdmin.
  const fieldPaths = Object.keys(opts.updates);
  if (fieldPaths.length === 0) {
    await rollback();
    return { transitioned: false, prior };
  }
  const commitBody = {
    transaction,
    writes: [
      {
        update: { name: fullName, fields: objectToFields(opts.updates) },
        updateMask: { fieldPaths },
        currentDocument: { exists: true },
      },
    ],
  };
  const commitRes = await fetch(`${base}:commit`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(commitBody),
  });
  if (!commitRes.ok) {
    // Aborted (concurrent commit) → another writer won the race. That's the
    // desired behaviour — caller treats this as not-transitioned.
    const text = await commitRes.text();
    if (commitRes.status === 409 || /ABORTED|FAILED_PRECONDITION/i.test(text)) {
      return { transitioned: false, prior };
    }
    throw new Error(`Firestore tx commit failed: ${commitRes.status} ${text}`);
  }
  return { transitioned: true, prior };
}

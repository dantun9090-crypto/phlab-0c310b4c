/**
 * Firestore managed export helper — Cloudflare Worker–safe.
 *
 * Uses the same Web Crypto RS256 JWT dance as `firestore-admin.ts` to mint a
 * short-lived Google OAuth access token, then calls the Firestore v1
 * export/import + long-running operations REST API.
 *
 * Docs:
 *   POST v1/projects/{PROJECT}/databases/(default):exportDocuments
 *   GET  v1/{operationName}                       (poll status)
 *
 * The output prefix is a GCS URI (`gs://bucket[/prefix]`). Firebase Storage
 * buckets are regular GCS buckets, so we default to writing into the project's
 * existing Storage bucket under `firestore-backups/<UTC-timestamp>/` unless
 * `FIREBASE_BACKUP_BUCKET` overrides it.
 *
 * Restore (manual, one-off):
 *   gcloud firestore import gs://BUCKET/firestore-backups/<TS>/<TS>.overall_export_metadata
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";
const DEFAULT_BUCKET = "prohealthpeptides-a0808.firebasestorage.app";

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

/**
 * Normalise the configured bucket into `gs://bucket[/prefix]` with NO
 * trailing slash. Falls back to the Firebase Storage bucket for the project.
 */
function getBackupBase(): { bucket: string; prefix: string; base: string } {
  const raw = (process.env.FIREBASE_BACKUP_BUCKET || `gs://${DEFAULT_BUCKET}/firestore-backups`)
    .trim()
    .replace(/\/+$/, "");
  const m = /^gs:\/\/([^/]+)(?:\/(.*))?$/.exec(raw);
  if (!m) throw new Error(`FIREBASE_BACKUP_BUCKET must start with gs://, got: ${raw}`);
  const bucket = m[1];
  const prefix = (m[2] || "").replace(/^\/+/, "");
  return { bucket, prefix, base: `gs://${bucket}${prefix ? `/${prefix}` : ""}` };
}

export interface TriggerExportInput {
  /** Explicit list; empty/omit = ALL collections (recommended for DR). */
  collectionIds?: string[];
  /**
   * Optional override for the per-run folder name. Defaults to the current
   * UTC timestamp, e.g. `2026-07-01T03-00-00Z`.
   */
  runId?: string;
}

export interface TriggerExportResult {
  operationName: string;
  outputUriPrefix: string;
  collectionIds: string[];
  runId: string;
}

/**
 * Kick off a Firestore managed export. Returns immediately with the LRO
 * name; poll `getExportOperation(name)` for progress.
 */
export async function triggerFirestoreExport(
  input: TriggerExportInput = {},
): Promise<TriggerExportResult> {
  const acct = getServiceAccount();
  const token = await getAccessToken();
  const { base } = getBackupBase();
  const runId =
    input.runId ||
    new Date().toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
  const outputUriPrefix = `${base}/${runId}`;
  const collectionIds = Array.isArray(input.collectionIds) ? input.collectionIds : [];

  const url = `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default):exportDocuments`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ outputUriPrefix, collectionIds }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Firestore exportDocuments failed: ${res.status} ${text}`);
  }
  const data = JSON.parse(text) as { name?: string };
  if (!data.name) throw new Error(`Firestore exportDocuments returned no operation name: ${text}`);
  return { operationName: data.name, outputUriPrefix, collectionIds, runId };
}

export interface ExportOperationStatus {
  name: string;
  done: boolean;
  status: "RUNNING" | "DONE" | "FAILED";
  error?: string;
  outputUriPrefix?: string;
  startTime?: string;
  endTime?: string;
  raw: unknown;
}

/**
 * Poll a Firestore export long-running operation.
 * `operationName` is the full name returned by `triggerFirestoreExport`,
 * e.g. `projects/PROJECT/databases/(default)/operations/ASA...`.
 */
export async function getExportOperation(operationName: string): Promise<ExportOperationStatus> {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/${operationName}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Firestore operations.get failed: ${res.status} ${text}`);
  }
  const raw = JSON.parse(text) as {
    name: string;
    done?: boolean;
    error?: { message?: string };
    metadata?: {
      outputUriPrefix?: string;
      startTime?: string;
      endTime?: string;
      operationState?: string;
    };
  };
  const done = raw.done === true;
  const err = raw.error?.message;
  const state = raw.metadata?.operationState || (done ? (err ? "FAILED" : "DONE") : "RUNNING");
  const status: ExportOperationStatus["status"] =
    err ? "FAILED" : state === "SUCCESSFUL" || state === "DONE" ? "DONE" : done ? "DONE" : "RUNNING";
  return {
    name: raw.name,
    done,
    status,
    error: err,
    outputUriPrefix: raw.metadata?.outputUriPrefix,
    startTime: raw.metadata?.startTime,
    endTime: raw.metadata?.endTime,
    raw,
  };
}

/** For UI display. */
export function getConfiguredBackupBase(): string {
  return getBackupBase().base;
}

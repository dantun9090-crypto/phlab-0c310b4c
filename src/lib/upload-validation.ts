/**
 * Shared file-upload validation used by every admin/user upload surface
 * (banners, adverts, product images, site settings, account lab reports,
 * backups). Enforces MIME allowlist, size cap, filename sanitisation, and
 * SVG script-content scanning.
 *
 * Storage rules remain the source-of-truth gate; this is defence-in-depth
 * to fail fast in the browser before bytes leave the device.
 */

export const DEFAULT_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export class UploadValidationError extends Error {
  status: number;
  constructor(message: string, status = 415) {
    super(message);
    this.name = "UploadValidationError";
    this.status = status;
  }
}

export interface ValidateOptions {
  allowedMime?: readonly string[];
  maxBytes?: number;
}

/**
 * Strip path traversal, slashes, null bytes, and any character outside
 * [a-z0-9._-]. Never use the raw File.name as part of a Storage path.
 */
export function sanitizeFilename(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "file";
  const cleaned = base
    .replace(/\.\.+/g, ".")
    .replace(/\x00/g, "")
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 120);
  return cleaned || "file";
}

async function readHeadText(file: File, bytes = 4096): Promise<string> {
  const slice = file.slice(0, Math.min(bytes, file.size));
  return await slice.text();
}

/**
 * Validate a file is a safe image upload. Throws UploadValidationError
 * with an appropriate HTTP-style status on failure.
 */
export async function validateImageFile(
  file: File,
  opts: ValidateOptions = {},
): Promise<void> {
  const allowed = opts.allowedMime ?? DEFAULT_IMAGE_MIME;
  const maxBytes = opts.maxBytes ?? MAX_IMAGE_BYTES;

  if (!file || !(file instanceof File)) {
    throw new UploadValidationError("No file provided", 400);
  }
  if (file.size === 0) {
    throw new UploadValidationError("File is empty", 400);
  }
  if (file.size > maxBytes) {
    throw new UploadValidationError(
      `File too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)`,
      413,
    );
  }
  const type = (file.type || "").toLowerCase();
  if (!allowed.includes(type as (typeof allowed)[number])) {
    throw new UploadValidationError(
      `Unsupported file type "${type || "unknown"}". Allowed: ${allowed.join(", ")}`,
      415,
    );
  }

  // SVG: reject any script content or javascript: handlers — prevents
  // stored-XSS via uploaded "images" rendered in <img> or inline.
  if (type === "image/svg+xml") {
    const head = (await readHeadText(file, 16_384)).toLowerCase();
    if (
      head.includes("<script") ||
      head.includes("javascript:") ||
      /\son\w+\s*=/.test(head) // onload=, onerror=, ...
    ) {
      throw new UploadValidationError(
        "SVG contains script content and was rejected",
        415,
      );
    }
  }
}

/**
 * Validate + return a safe Storage path. Caller supplies the directory
 * prefix; user-supplied filename is sanitised and prefixed with a
 * timestamp to avoid collisions and overwrite attacks.
 */
export async function validateAndBuildStoragePath(
  file: File,
  prefix: string,
  opts: ValidateOptions = {},
): Promise<string> {
  await validateImageFile(file, opts);
  const safe = sanitizeFilename(file.name);
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  return `${cleanPrefix}/${Date.now()}_${safe}`;
}

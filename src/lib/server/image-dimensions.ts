/**
 * Server-side image dimension parser for common web formats.
 *
 * Reads pixel width/height straight from the file header — no native
 * dependencies, safe in the Cloudflare Worker runtime. Supports PNG,
 * JPEG, WebP (VP8, VP8L, VP8X), GIF and AVIF.
 *
 * Returns null when the bytes don't match a known header; callers should
 * treat that as an invalid/corrupt upload.
 */

export interface ImageDimensions {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp" | "gif" | "avif";
}

function readUint16BE(b: Uint8Array, o: number) { return (b[o] << 8) | b[o + 1]; }
function readUint32BE(b: Uint8Array, o: number) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
function readUint32LE(b: Uint8Array, o: number) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

function parsePng(b: Uint8Array): ImageDimensions | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A, IHDR at offset 16
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  return { width: readUint32BE(b, 16), height: readUint32BE(b, 20), format: "png" };
}

function parseJpeg(b: Uint8Array): ImageDimensions | null {
  // JPEG: FF D8, walk markers until SOF (C0..CF except C4/C8/CC)
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    // skip fill bytes
    while (i < b.length && b[i] === 0xff) i++;
    const marker = b[i]; i++;
    if (marker === 0xd8 || marker === 0xd9) return null; // SOI/EOI unexpected here
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // standalone
    if (i + 2 > b.length) return null;
    const segLen = readUint16BE(b, i);
    if (
      (marker >= 0xc0 && marker <= 0xcf) &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    ) {
      // SOFn: [len2][precision1][height2][width2]
      if (i + 7 > b.length) return null;
      return { height: readUint16BE(b, i + 3), width: readUint16BE(b, i + 5), format: "jpeg" };
    }
    i += segLen;
  }
  return null;
}

function parseWebp(b: Uint8Array): ImageDimensions | null {
  // RIFF....WEBP
  if (b.length < 30) return null;
  if (b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46) return null;
  if (b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8 ") {
    // Lossy: width/height at offset 26/28 (14-bit little-endian)
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
      format: "webp",
    };
  }
  if (chunk === "VP8L") {
    // Lossless: 14-bit width/height packed after 0x2f signature at offset 20
    if (b[20] !== 0x2f) return null;
    const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      format: "webp",
    };
  }
  if (chunk === "VP8X") {
    // Extended: 24-bit width-1/height-1 at offset 24/27
    return {
      width: 1 + ((b[24] | (b[25] << 8) | (b[26] << 16)) & 0xffffff),
      height: 1 + ((b[27] | (b[28] << 8) | (b[29] << 16)) & 0xffffff),
      format: "webp",
    };
  }
  return null;
}

function parseGif(b: Uint8Array): ImageDimensions | null {
  if (b.length < 10) return null;
  if (b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8), format: "gif" };
}

function parseAvif(b: Uint8Array): ImageDimensions | null {
  // ISO BMFF ftyp with brand 'avif' or 'avis'
  if (b.length < 32) return null;
  if (b[4] !== 0x66 || b[5] !== 0x74 || b[6] !== 0x79 || b[7] !== 0x70) return null;
  const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (brand !== "avif" && brand !== "avis" && brand !== "mif1") return null;
  // Walk boxes looking for meta > iprp > ipco > ispe (image spatial extents)
  let i = 0;
  while (i + 8 <= b.length) {
    const size = readUint32BE(b, i);
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (type === "ispe" && i + 20 <= b.length) {
      return { width: readUint32BE(b, i + 12), height: readUint32BE(b, i + 16), format: "avif" };
    }
    // Recurse into container boxes
    const container = ["meta", "iprp", "ipco"].includes(type);
    if (container) {
      // meta has a 4-byte version+flags after the header
      i += 8 + (type === "meta" ? 4 : 0);
      continue;
    }
    if (size < 8) break;
    i += size;
  }
  return null;
}

export function parseImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return (
    parsePng(bytes) ||
    parseJpeg(bytes) ||
    parseWebp(bytes) ||
    parseGif(bytes) ||
    parseAvif(bytes)
  );
}

export interface DimensionConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
}

export class ImageValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

export function assertImageDimensions(
  bytes: Uint8Array,
  declaredContentType: string,
  c: DimensionConstraints,
): ImageDimensions {
  const dims = parseImageDimensions(bytes);
  if (!dims) throw new ImageValidationError("invalid_image_header", "Could not parse image header");
  // Enforce declared content-type matches actual bytes to stop MIME spoofing.
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  const expected = map[declaredContentType.toLowerCase()];
  if (expected && expected !== dims.format) {
    throw new ImageValidationError(
      "content_type_mismatch",
      `Declared ${declaredContentType} but bytes are ${dims.format}`,
    );
  }
  if (c.minWidth && dims.width < c.minWidth)
    throw new ImageValidationError("image_too_narrow", `Width ${dims.width}px below min ${c.minWidth}px`);
  if (c.minHeight && dims.height < c.minHeight)
    throw new ImageValidationError("image_too_short", `Height ${dims.height}px below min ${c.minHeight}px`);
  if (c.maxWidth && dims.width > c.maxWidth)
    throw new ImageValidationError("image_too_wide", `Width ${dims.width}px above max ${c.maxWidth}px`);
  if (c.maxHeight && dims.height > c.maxHeight)
    throw new ImageValidationError("image_too_tall", `Height ${dims.height}px above max ${c.maxHeight}px`);
  if (c.maxPixels && dims.width * dims.height > c.maxPixels)
    throw new ImageValidationError(
      "image_too_many_pixels",
      `Image has ${dims.width * dims.height} pixels, above max ${c.maxPixels}`,
    );
  return dims;
}

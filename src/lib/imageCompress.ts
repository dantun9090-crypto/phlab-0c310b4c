/**
 * Client-side image compression → WebP with a hard size ceiling.
 *
 * Used by Admin → Inventory (ProductEditor) and Admin → Banner so every new
 * upload lands in Firebase Storage as a small WebP (≤ targetBytes) instead of
 * a multi-MB PNG/JPEG. This is what keeps Home and product pages under the
 * Lighthouse 10 MB ceiling on mobile.
 *
 * Strategy:
 *   1. Skip tiny files (< 60 KB) — they're already smaller than re-encode noise.
 *   2. Draw onto a canvas resized so the longest edge ≤ maxPx.
 *   3. Encode as WebP starting at `quality`. If the blob is still over
 *      targetBytes, drop quality in 0.07 steps down to a floor of 0.45 and
 *      retry. If still over, shrink maxPx by 15% and retry once.
 *   4. Fall back to the original file if every attempt is still bigger.
 */
export interface CompressOptions {
  maxPx?: number;
  quality?: number;
  targetBytes?: number;
}

export async function compressToWebp(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const { maxPx = 1600, quality = 0.82, targetBytes = 200_000 } = opts;
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 60_000) return file;
  if (typeof document === "undefined") return file;

  const bitmap = await loadBitmap(file);
  if (!bitmap) return file;

  try {
    let currentMax = maxPx;
    for (let pass = 0; pass < 2; pass++) {
      const { width, height } = fitInside(bitmap.width, bitmap.height, currentMax);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, width, height);

      let q = quality;
      let best: Blob | null = null;
      while (q >= 0.45) {
        const blob = await canvasToBlob(canvas, "image/webp", q);
        if (!blob) break;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= targetBytes) {
          best = blob;
          break;
        }
        q -= 0.07;
      }
      if (best && best.size <= targetBytes) {
        return blobToFile(best, file.name);
      }
      // Shrink and try again
      currentMax = Math.round(currentMax * 0.85);
      if (pass === 1 && best && best.size < file.size) {
        return blobToFile(best, file.name);
      }
    }
    return file;
  } finally {
    if ("close" in bitmap && typeof bitmap.close === "function") {
      try { bitmap.close(); } catch { /* noop */ }
    }
  }
}

function fitInside(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  if (w >= h) {
    return { width: max, height: Math.round((h / w) * max) };
  }
  return { width: Math.round((w / h) * max), height: max };
}

async function loadBitmap(file: File): Promise<HTMLImageElement | ImageBitmap | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to HTMLImageElement
    }
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

function blobToFile(blob: Blob, originalName: string): File {
  const name = originalName.replace(/\.\w+$/, "") + ".webp";
  return new File([blob], name, { type: "image/webp" });
}

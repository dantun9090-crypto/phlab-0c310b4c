/**
 * Best-effort client-side page screenshot for the blank-page watchdog.
 *
 * Uses the SVG `<foreignObject>` + canvas technique so we have zero deps and
 * stay <2KB. Lossy and limited (cross-origin images may taint the canvas;
 * shadow DOM and some CSS won't render perfectly), but good enough to see
 * what the user looked at when the fallback overlay fired.
 *
 * The inline pre-React watchdog in `src/routes/__root.tsx` keeps an inlined
 * mirror of this logic — keep them in sync.
 */
export interface ScreenshotOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  timeoutMs?: number;
}

export async function captureBlankWatchdogScreenshot(
  options: ScreenshotOptions = {},
): Promise<string | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const { maxWidth = 1024, maxHeight = 1024, quality = 0.5, timeoutMs = 1500 } = options;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);

    try {
      const w = Math.min(window.innerWidth || 1024, maxWidth);
      const h = Math.min(window.innerHeight || 1024, maxHeight);
      const body = document.body;
      if (!body) return finish(null);

      // Clone body and strip <script> / <style src> nodes that won't serialise.
      const clone = body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("script, link[rel='stylesheet']").forEach((n) => n.remove());
      const inner = new XMLSerializer().serializeToString(clone);

      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
        `<foreignObject width="100%" height="100%">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="background:#060f1e;color:#f0f6ff;font-family:system-ui;width:${w}px;height:${h}px;overflow:hidden">` +
        inner +
        `</div></foreignObject></svg>`;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return finish(null);
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          window.clearTimeout(timer);
          finish(dataUrl);
        } catch {
          finish(null);
        }
      };
      img.onerror = () => finish(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch {
      finish(null);
    }
  });
}

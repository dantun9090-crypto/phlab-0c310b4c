import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

/**
 * <SmartImage>
 *
 * Drop-in replacement for <img> that:
 *  - Reserves layout space via width/height to prevent CLS.
 *  - Shows a subtle skeleton pulse while the image decodes.
 *  - Calls decode() before swapping the source in, so back/forward
 *    re-renders (when bfcache misses) never flash a blank box.
 *  - Defaults to `loading="eager"` + `fetchpriority="high"` for above-fold
 *    use; pass `loading="lazy"` for below-fold imagery.
 *
 * The skeleton is rendered as a sibling background on the wrapper, so even
 * if the image fails to decode the box keeps the page's visual rhythm.
 */
export interface SmartImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Wrapper className (skeleton lives here). */
  wrapperClassName?: string;
  /** Disable the skeleton (useful for transparent logos). */
  noSkeleton?: boolean;
}

export function SmartImage({
  src,
  alt = "",
  width,
  height,
  loading = "eager",
  decoding = "async",
  fetchPriority,
  wrapperClassName,
  noSkeleton,
  className,
  style,
  onLoad,
  onError,
  ...rest
}: SmartImageProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // If the browser restores from bfcache, the <img> is already complete on
  // first paint — flip ready immediately to avoid a phantom skeleton frame.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) setReady(true);
  }, [src]);

  const showSkeleton = !noSkeleton && !ready && !failed;

  return (
    <span
      className={wrapperClassName}
      style={{
        position: "relative",
        display: "inline-block",
        width: width ? `${width}px` : "100%",
        height: height ? `${height}px` : "auto",
        overflow: "hidden",
        ...(showSkeleton
          ? {
              backgroundColor: "rgb(30 41 59 / 0.5)",
              backgroundImage:
                "linear-gradient(90deg, rgb(30 41 59 / 0) 0%, rgb(51 65 85 / 0.6) 50%, rgb(30 41 59 / 0) 100%)",
              backgroundSize: "200% 100%",
              animation: "smart-image-shimmer 1.4s linear infinite",
            }
          : null),
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        // @ts-expect-error fetchpriority is valid in modern browsers
        fetchpriority={fetchPriority ?? (loading === "eager" ? "high" : "auto")}
        className={className}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: ready ? 1 : 0,
          transition: "opacity 180ms ease-out",
          ...style,
        }}
        onLoad={(e) => {
          setReady(true);
          onLoad?.(e);
        }}
        onError={(e) => {
          setFailed(true);
          onError?.(e);
        }}
        {...rest}
      />
      {/* Shimmer keyframes — scoped via a <style> tag so we don't pollute
          globals. Browser dedupes identical <style> nodes. */}
      <style>{`@keyframes smart-image-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </span>
  );
}

export default SmartImage;

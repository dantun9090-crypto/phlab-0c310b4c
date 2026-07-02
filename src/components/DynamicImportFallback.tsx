/**
 * User-facing fallback rendered when a dynamic import terminally fails
 * (after retries, and it wasn't a stale-chunk — those self-heal via
 * hardReload). Gives the user a clear next step instead of a blank page.
 *
 * Presentation-only. Uses the project palette (slate-950 / emerald-500)
 * and semantic HTML. Accessible: role="alert", labelled retry button.
 */
import { hardReload } from "@/lib/recovery";

interface Props {
  /** Optional module label to show in small print for support. */
  label?: string;
  /** Optional custom retry handler — defaults to hard reload. */
  onRetry?: () => void;
}

export function DynamicImportFallback({ label, onRetry }: Props) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
      return;
    }
    void hardReload({ clean: true });
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-slate-950 text-white"
    >
      <div className="max-w-md w-full text-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="mt-6 text-xl font-semibold">This page couldn't load</h2>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
          A part of the app failed to download. This is usually a temporary
          network hiccup. Reloading almost always fixes it.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-6 inline-flex items-center gap-2 px-6 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors min-h-[48px]"
        >
          Reload the page
        </button>
        {label && (
          <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Ref: {label}
          </p>
        )}
      </div>
    </div>
  );
}

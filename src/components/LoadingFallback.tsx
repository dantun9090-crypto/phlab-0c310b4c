export function LoadingFallback() {
  return (
    <div
      className="min-h-screen bg-[#060f1e] px-6 pt-24 flex items-center justify-center text-[#f0f6ff]"
      role="status"
      aria-live="polite"
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="relative" aria-hidden="true">
          <div className="w-12 h-12 rounded-full border-2 border-emerald-600/20 border-t-emerald-500 animate-spin" />
          <div
            className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-b-emerald-400/40 animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
          />
        </div>
        <p className="mt-5 text-sm font-semibold tracking-[0.18em] text-emerald-400 uppercase">
          PH Labs loading
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          If this stays here, refresh once to fetch the latest store version.
        </p>
        <a
          href="/?sw=off"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-white"
        >
          Reload store
        </a>
      </div>
    </div>
  );
}

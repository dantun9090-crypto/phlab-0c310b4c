export function LoadingFallback() {
  return (
    <div
      className="min-h-screen bg-[#060f1e] pt-24 flex items-center justify-center"
      aria-hidden="true"
    >
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-blue-600/20 border-t-blue-500 animate-spin" />
        <div
          className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-b-blue-400/40 animate-spin"
          style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
        />
      </div>
    </div>
  );
}

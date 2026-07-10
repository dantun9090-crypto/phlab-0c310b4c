import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function openFreshPage() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("nocache", "1");
    url.searchParams.set("sw", "off");
    url.searchParams.set("phl_loop_disabled", "1");
    url.searchParams.set("_r", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.href = `/?nocache=1&sw=off&phl_loop_disabled=1&_r=${Date.now()}`;
  }
}

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[ROUTER DEFAULT ERROR]", error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Please refresh</h1>
        <p className="mt-2 text-sm text-muted-foreground">The page could not initialise cleanly.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={openFreshPage}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Pro Health Peptides UK" },
      { property: "og:site_name", content: "Pro Health Peptides UK" },
      { property: "og:locale", content: "en_GB" },
      { name: "geo.region", content: "GB" },
      { name: "geo.placename", content: "United Kingdom" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "google-site-verification", content: "tYtU-dRlfAq14D7lyPTYf8noiJH-b0LifcvvrGi8AZw" },
      { key: "title", title: "Pro Health Peptides UK — HPLC-Verified Research Peptides" },
      { key: "og:title", property: "og:title", content: "Pro Health Peptides UK — HPLC-Verified Research Peptides" },
      { key: "twitter:title", name: "twitter:title", content: "Pro Health Peptides UK — HPLC-Verified Research Peptides" },
      { key: "description", name: "description", content: "UK supplier of HPLC-verified research peptides and reference compounds. For in-vitro laboratory research use only." },
      { key: "og:description", property: "og:description", content: "UK supplier of HPLC-verified research peptides and reference compounds. For in-vitro laboratory research use only." },
      { key: "twitter:description", name: "twitter:description", content: "UK supplier of HPLC-verified research peptides and reference compounds. For in-vitro laboratory research use only." },
      { key: "og:url", property: "og:url", content: "https://www.prohealthpeptides.co.uk/" },
      { key: "og:image", property: "og:image", content: "https://www.prohealthpeptides.co.uk/og-image.jpg" },
      { key: "twitter:image", name: "twitter:image", content: "https://www.prohealthpeptides.co.uk/og-image.jpg" },
      { key: "og:type", property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://firestore.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebaseinstallations.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebasestorage.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://identitytoolkit.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://cdn.wegic.ai" },
      { rel: "dns-prefetch", href: "https://firestore.googleapis.com" },
      { rel: "dns-prefetch", href: "https://firebasestorage.googleapis.com" },
      { rel: "dns-prefetch", href: "https://cdn.wegic.ai" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

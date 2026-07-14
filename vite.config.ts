// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Build-time identifier — changes on every Lovable Publish/deploy. CI passes
// PHLABS_BUILD_ID from scripts/build-with-retry.ts so Vite, post-build SW
// patching, HTML meta tags, and cache-busting asset URLs all share the exact
// same version. Local/dev builds fall back to a fresh timestamp.
const BUILD_ID =
  process.env.PHLABS_BUILD_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// No runtime PWA/app-shell Service Worker is registered. The static /sw.js and
// /service-worker.js files are kill-switch replacements only, used to evict old
// Workbox/app-shell caches from returning browsers after deploys.

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    client: { entry: "client" },
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    build: {
      // Hidden source maps: emit .map files for error tracking without
      // exposing a sourceMappingURL in the shipped JS.
      sourcemap: "hidden",
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          // Split heavy vendor libraries into separate chunks so:
          //  (1) the main app bundle (index-*.js) shrinks — currently ~505 KB
          //      with ~240 KB unused, causing 3.5s scripting time on Lighthouse
          //      mobile and pushing LCP past 11s;
          //  (2) chunks load in parallel across HTTP/2 rather than serially;
          //  (3) each vendor caches independently so most publishes only
          //      invalidate the app chunk, not gigabytes of unchanged deps.
          // Route-level code lives in per-route chunks (TanStack auto-split);
          // this only groups shared node_modules.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("/firebase/") || id.includes("@firebase/")) return "vendor-firebase";
            if (id.includes("/@sentry/") || id.includes("/sentry-")) return "vendor-sentry";
            if (id.includes("/recharts/") || id.includes("/d3-")) return "vendor-charts";
            if (id.includes("/three/") || id.includes("/@react-three/")) return "vendor-three";
            if (id.includes("/framer-motion/")) return "vendor-motion";
            if (id.includes("/jspdf/") || id.includes("/pdfjs")) return "vendor-pdf";
            if (id.includes("/@radix-ui/")) return "vendor-radix";
            if (id.includes("/lucide-react/")) return "vendor-icons";
            if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "vendor-react";
            if (id.includes("/@tanstack/")) return "vendor-tanstack";
            // Everything else stays in the default vendor chunk.
          },
        },
      },
    },
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
    },
  },
});

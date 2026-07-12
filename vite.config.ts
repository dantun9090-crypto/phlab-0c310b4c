// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Build-time identifier — changes on every Lovable Publish (new build = new
// timestamp). Used by /api/public/post-publish-check to detect a fresh
// deployment and fire Cloudflare purge + Prerender recache exactly once.
const BUILD_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// No runtime PWA/app-shell Service Worker is registered. The static /sw.js and
// /service-worker.js files are kill-switch replacements only, used to evict old
// Workbox/app-shell caches from returning browsers after deploys.

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    client: { entry: "client" },
    server: { entry: "server" },
    prerender: {
      routes: ["/"],
    },
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
        },
      },
    },
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
    },
  },
});

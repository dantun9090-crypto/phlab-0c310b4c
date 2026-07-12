import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Use git hash or package.json version instead of timestamp
// This only changes when code actually changes, not on every build
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 7) || 
                 process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 
                 'dev';

export default defineConfig({
  tanstackStart: {
    client: { entry: "client" },
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    build: {
      sourcemap: "hidden",
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          // ADD THIS — split vendors into separate chunks
          manualChunks(id) {
            // React core → separate chunk (cached longer)
            if (id.includes('node_modules/react') || 
                id.includes('node_modules/react-dom') ||
                id.includes('node_modules/scheduler')) {
              return 'vendor-react';
            }
            // TanStack → separate chunk
            if (id.includes('node_modules/@tanstack')) {
              return 'vendor-tanstack';
            }
            // Firebase → separate chunk (only loaded when needed)
            if (id.includes('node_modules/@firebase') || 
                id.includes('node_modules/firebase')) {
              return 'vendor-firebase';
            }
            // Framer Motion → separate chunk
            if (id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
            // Other large vendors → one chunk
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
      // ADD THIS — chunk size warning (500 KB raw)
      chunkSizeWarningLimit: 500,
    },
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
    },
  },
});

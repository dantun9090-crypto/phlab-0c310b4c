import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // tsconfigPaths alone fails on "@/lib/*.server" specifiers (the
      // ".server" infix breaks its extension probing) — keep an explicit
      // alias so tests/ can import server modules too.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // happy-dom avoids jsdom's undici v7 requirement, which conflicts with
    // this project's undici v8 override and breaks `bunx vitest run` startup.
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // e2e/ holds Playwright specs — they require the Playwright runner and a
    // live/preview target, and must never be picked up by the unit runner.
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**", "**/*.e2e.test.ts"],
  },
});

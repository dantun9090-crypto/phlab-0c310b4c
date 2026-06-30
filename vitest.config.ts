import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // happy-dom avoids jsdom's undici v7 requirement, which conflicts with
    // this project's undici v8 override and breaks `bunx vitest run` startup.
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});

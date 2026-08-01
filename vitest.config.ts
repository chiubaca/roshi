import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    tanstackStart(),
    cloudflareTest({
      main: "./src/index.ts",
      remoteBindings: false,
      miniflare: {
        bindings: { ROSHI_PASSWORD: "test-password" },
      },
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    testTimeout: 30_000,
    setupFiles: ["./src/test-setup.ts"],
  },
});

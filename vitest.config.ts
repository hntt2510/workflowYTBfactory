import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/desktop/src/renderer/**/*.test.ts"],
    environment: "node"
  },
  resolve: {
    alias: {
      "@lsf/domain": new URL("./packages/domain/src/index.ts", import.meta.url).pathname,
      "@lsf/providers": new URL("./packages/providers/src/index.ts", import.meta.url).pathname,
      "@lsf/generation-queue": new URL("./packages/generation-queue/src/index.ts", import.meta.url).pathname,
      "@lsf/media": new URL("./packages/media/src/index.ts", import.meta.url).pathname,
      "@lsf/capcut": new URL("./packages/capcut/src/index.ts", import.meta.url).pathname,
      "@lsf/db": new URL("./packages/db/src/index.ts", import.meta.url).pathname,
      "@lsf/prompts": new URL("./packages/prompts/src/index.ts", import.meta.url).pathname
    }
  }
});

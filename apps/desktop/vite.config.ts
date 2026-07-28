import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@lsf/domain": new URL("../../packages/domain/src/index.ts", import.meta.url).pathname,
      "@lsf/generation-queue": new URL("../../packages/generation-queue/src/index.ts", import.meta.url).pathname,
      "@lsf/providers": new URL("../../packages/providers/src/index.ts", import.meta.url).pathname
    }
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  }
});


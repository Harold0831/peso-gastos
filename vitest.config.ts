import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js resuelve "server-only" a un no-op vía webpack; bajo Vitest
      // (Node puro) su implementación real lanza un error a propósito.
      "server-only": path.resolve(__dirname, "src/lib/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

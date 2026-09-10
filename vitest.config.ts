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
    env: {
      /**
       * Los tests corren en la zona horaria de RD, no en UTC.
       *
       * No es cosmético: en UTC un bug real de zona horaria es INVISIBLE.
       * El 2026-09-10 la pantalla de transacciones mostraba "Agosto" con las
       * transacciones de septiembre y la flecha › no avanzaba, porque el
       * servidor (Vercel, en UTC) mandaba el mes al cliente como `Date` y el
       * navegador dominicano lo reinterpretaba 4 horas antes — es decir, en
       * el mes anterior. Toda la suite pasaba en verde mientras tanto.
       *
       * Corriendo en AST, cualquier fecha que dependa de la zona horaria del
       * proceso falla aquí antes que en el teléfono de alguien.
       */
      TZ: "America/Santo_Domingo",
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Entorno Node por defecto (motor de indicadores sin DOM).
    environment: "node",
    // Globals opcional: habilitado para poder usar describe/it/expect sin imports.
    globals: true,
    // Incluir todos los tests bajo test/ (parity, property y generales).
    include: [
      "test/**/*.{test,spec}.{ts,tsx,js,mjs}",
    ],
  },
});

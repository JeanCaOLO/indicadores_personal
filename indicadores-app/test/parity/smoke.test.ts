import { describe, it, expect } from "vitest";

// Smoke test trivial para verificar que el runner (Vitest) funciona
// y que la ruta test/parity queda incluida por la configuración.
describe("smoke", () => {
  it("runner works", () => {
    expect(1 + 1).toBe(2);
  });
});

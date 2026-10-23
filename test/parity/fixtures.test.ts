// test/parity/fixtures.test.ts
//
// Test mínimo (no es el test de paridad completo; eso es la tarea 6.2).
// Sólo verifica que:
//   - loadDB() / loadGolden() cargan los fixtures y tienen la forma esperada.
//   - GOLDEN_TODAY y makeCtx() producen el contexto correcto.
//   - compareValue() / compareRawPair() funcionan en casos triviales.

import { describe, it, expect } from "vitest";

import { loadDB, loadGolden, GOLDEN_TODAY, makeCtx } from "./fixtures";
import { compareValue, compareRawPair, kpiTypeOf, EPS } from "./compare";

describe("parity fixtures loader", () => {
  it("loadDB expone __cfg y al menos un mes YYYY-MM", () => {
    const db = loadDB();
    expect(db.__cfg).toBeDefined();
    const monthKeys = Object.keys(db).filter((k) => /^\d{4}-\d{2}$/.test(k));
    expect(monthKeys.length).toBeGreaterThan(0);
  });

  it("loadGolden expone meta.today y byMonthPais con celdas", () => {
    const g = loadGolden();
    expect(g.meta.today).toBe("2026-10-06T00:00:00.000Z");
    const cell = g.byMonthPais["2025-12"].__all__;
    expect(cell.ind.dias_sin_acc).toBe(26);
  });

  it("GOLDEN_TODAY se lee de meta.today y makeCtx construye el contexto", () => {
    expect(GOLDEN_TODAY.toISOString()).toBe(loadGolden().meta.today);
    const ctx = makeCtx("Costa Rica", 2026);
    expect(ctx).toEqual({
      pais: "Costa Rica",
      dep: "__all__",
      area: "__all__",
      today: GOLDEN_TODAY,
      dashYear: 2026,
    });
  });
});

describe("parity comparator", () => {
  it("float dentro de 1e-6 coincide y fuera no", () => {
    // encuesta es type "num" (float) → tolerancia EPS.
    expect(kpiTypeOf("encuesta")).toBe("float");
    expect(compareValue("encuesta", 4.02 + EPS / 2, 4.02).ok).toBe(true);
    expect(compareValue("encuesta", 4.02 + 1e-3, 4.02).ok).toBe(false);
  });

  it("int exige igualdad exacta y null es significativo", () => {
    // accidentes es type "int" → igualdad exacta.
    expect(kpiTypeOf("accidentes")).toBe("int");
    expect(compareValue("accidentes", 3, 3).ok).toBe(true);
    expect(compareValue("accidentes", 3.0000001, 3).ok).toBe(false);

    // null golden coincide sólo con actual nulo.
    expect(compareValue("promo", null, null).ok).toBe(true);
    expect(compareValue("promo", 0, null).ok).toBe(false);
    expect(compareValue("promo", null, 0).ok).toBe(false);
  });

  it("compareRawPair compara ambos componentes con tolerancia", () => {
    expect(compareRawPair("rot_total", [2, 187], [2, 187]).ok).toBe(true);
    expect(compareRawPair("rot_total", [2, 187.0000001], [2, 187]).ok).toBe(true);
    expect(compareRawPair("rot_total", [2, 188], [2, 187]).ok).toBe(false);
  });
});

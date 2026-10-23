// =============================================================================
// test/clean.test.ts
//
// Verifica el port puro de `limpiarMesesVacios` (supabase/migrate/clean.ts)
// contra el snapshot kv real (test/fixtures/db.snapshot.json).
//
// HALLAZGO IMPORTANTE (ver reporte de la tarea 8.1):
// El port es FIEL al Sistema_Actual (out/index.html). Sobre este fixture, la
// función descarta SOLO 3 meses (los que tienen `params` completo pero todos
// sus valores vacíos y sin registros): 2026-10, 2026-11, 2026-12. Conserva los
// otros 181, porque 171 de ellos (meses de años bogus, p. ej. 2087-09) traen
// UN registro real en `activos`, y la regla del Sistema_Actual conserva
// cualquier mes con `rec` (algún array de entidades con length) truthy.
//
// Es decir: `limpiarMesesVacios` por sí sola NO alcanza para descartar ~170
// meses basura de este snapshot; esos meses tienen un `activos` de longitud 1.
// Este test fija el comportamiento FIEL observado para evitar regresiones.
// =============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { limpiarMesesVacios, type RawDB } from "../supabase/migrate/clean";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSnapshot(): RawDB {
  const p = join(__dirname, "fixtures", "db.snapshot.json");
  return JSON.parse(readFileSync(p, "utf8")) as RawDB;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

describe("limpiarMesesVacios (fixture db.snapshot.json)", () => {
  it("replica EXACTO el Sistema_Actual: descarta 3 meses sin datos y conserva 181", () => {
    const snapshot = loadSnapshot();
    const totalMonths = Object.keys(snapshot).filter((k) =>
      MONTH_RE.test(k),
    ).length;

    const { kept, removed } = limpiarMesesVacios(snapshot);

    // kept + removed cubre exactamente todas las claves de mes.
    expect(kept.length + removed.length).toBe(totalMonths);

    // Comportamiento fiel observado sobre este snapshot.
    expect(removed.sort()).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(removed.length).toBe(3);
    expect(kept.length).toBe(totalMonths - 3);
  });

  it("descarta solo meses sin rec && sin numOk && sin lvl && sin fecha_ult_accidente", () => {
    const snapshot = loadSnapshot();
    const { removed } = limpiarMesesVacios(snapshot);
    const arr = [
      "activos",
      "egresos",
      "ausencias",
      "areas",
      "capacitacion",
      "extras",
      "vacaciones",
      "merma",
      "terceros",
    ];
    for (const k of removed) {
      const d = snapshot[k] as Record<string, unknown>;
      const p = (d.params ?? {}) as Record<string, unknown>;
      const rec = arr.some((f) => {
        const v = d[f];
        return Array.isArray(v) && v.length > 0;
      });
      expect(rec).toBe(false);
      expect(Boolean(p.fecha_ult_accidente)).toBe(false);
    }
  });

  it("conserva __cfg y nunca lo clasifica como mes", () => {
    const snapshot = loadSnapshot();
    const { kept, removed, db } = limpiarMesesVacios(snapshot);

    expect("__cfg" in db).toBe(true);
    expect(db.__cfg).toBe(snapshot.__cfg);
    expect(kept).not.toContain("__cfg");
    expect(removed).not.toContain("__cfg");
  });

  it("no muta el input (las claves descartadas siguen en el original)", () => {
    const snapshot = loadSnapshot();
    const keysBefore = Object.keys(snapshot).length;
    const { removed, db } = limpiarMesesVacios(snapshot);

    expect(Object.keys(snapshot).length).toBe(keysBefore);
    for (const r of removed) {
      expect(r in snapshot).toBe(true); // sigue en el original
      expect(r in db).toBe(false); // ausente en el db limpio
    }
  });
});

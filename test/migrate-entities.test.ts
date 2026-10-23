// =============================================================================
// test/migrate-entities.test.ts
//
// Verifica la migración de meses, países, entidades y parámetros (tarea 8.3) de
// `supabase/migrate/migrate-data.ts` en modo dry-run contra el snapshot real
// (test/fixtures/db.snapshot.json), sin tocar Supabase.
//
// Puntos que se validan:
//   - ind_meses = nº de meses conservados por `limpiarMesesVacios`.
//   - ind_paises = países realmente presentes en los datos (en el fixture, solo
//     "Costa Rica").
//   - ind_parametros_mes = una fila por (mes, país); en el fixture 1 país ⇒
//     = nº de meses.
//   - ind_colaboradores total > 0.
//   - Un mes conocido produce el conteo esperado de alguna entidad:
//       2026-07 → 182 colaboradores (activos no vacíos).
//       2026-09 →   0 colaboradores (activos vacíos) pero sí egresos/extras.
//   - Cédulas vacías no colapsan la PK (cada activo genera una fila).
// =============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { limpiarMesesVacios, type RawDB } from "../supabase/migrate/clean";
import {
  DryRunSink,
  migrateEntities,
} from "../supabase/migrate/migrate-data";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSnapshot(): RawDB {
  const p = join(__dirname, "fixtures", "db.snapshot.json");
  return JSON.parse(readFileSync(p, "utf8")) as RawDB;
}

describe("migrateEntities (dry-run, fixture)", () => {
  it("ind_meses coincide con los meses conservados y ind_paises con los presentes", async () => {
    const db = loadSnapshot();
    const { kept } = limpiarMesesVacios(db);

    const sink = new DryRunSink();
    await migrateEntities(db, kept, sink);

    // Una fila de mes por cada clave conservada.
    expect(sink.counts.ind_meses).toBe(kept.length);

    // En el fixture solo aparece "Costa Rica".
    expect(sink.counts.ind_paises).toBe(1);

    // Un params por (mes, país); con 1 país ⇒ igual al nº de meses.
    expect(sink.counts.ind_parametros_mes).toBe(kept.length);

    // Hay colaboradores migrados.
    expect(sink.counts.ind_colaboradores).toBeGreaterThan(0);
  });

  it("un mes con activos poblados migra todos sus colaboradores (2026-07)", async () => {
    const db = loadSnapshot();
    const activos = (db["2026-07"] as Record<string, unknown>)
      ?.activos as unknown[];
    const esperado = Array.isArray(activos) ? activos.length : 0;
    expect(esperado).toBe(182); // dato real del fixture

    const sink = new DryRunSink();
    await migrateEntities(db, ["2026-07"], sink);

    // Cada activo produce una fila pese a que todos traen cédula "" (PK no
    // colapsa gracias a la cédula sintética __row_<i>).
    expect(sink.counts.ind_colaboradores).toBe(esperado);
  });

  it("un mes sin activos no migra colaboradores pero sí otras entidades (2026-09)", async () => {
    const db = loadSnapshot();
    const sink = new DryRunSink();
    await migrateEntities(db, ["2026-09"], sink);

    expect(sink.counts.ind_colaboradores).toBe(0);
    expect(sink.counts.ind_egresos).toBeGreaterThan(0);
    expect(sink.counts.ind_extras).toBeGreaterThan(0);
  });

  it("filtra meses fuera del rango razonable solo si se pide (utilidad)", async () => {
    // La exclusión de años basura NO ocurre dentro de migrateEntities: es una
    // decisión del runner. Aquí comprobamos que migrateEntities migra
    // exactamente los meses que se le pasan, sin filtrar por año.
    const db = loadSnapshot();
    const { kept } = limpiarMesesVacios(db);
    const sink = new DryRunSink();
    await migrateEntities(db, kept, sink);
    expect(sink.counts.ind_meses).toBe(kept.length);
  });
});

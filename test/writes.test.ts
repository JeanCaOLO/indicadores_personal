// =============================================================================
// test/writes.test.ts
//
// Tests unitarios de `lib/data/writes.ts` (tarea 9.4) con un cliente Supabase
// MOCK. No se toca Supabase real: el mock simula la cadena
// `.from(table).delete().match(...)`, `.from(table).insert(rows, opts)` y
// `.from(table).upsert(row, opts)`, registrando las llamadas para aseverar que:
//   - replaceByPais BORRA por (mes, pais) correctos y luego INSERTA las filas.
//   - las filas insertadas llevan mes/pais fijados por los argumentos.
//   - el mapeo kind → tabla es correcto (activos → ind_colaboradores).
//   - las cédulas vacías/duplicadas de `activos` se vuelven sintéticas __row_<i>.
//   - devuelve la cantidad insertada.
//   - upsertParams hace upsert onConflict "mes,pais".
//   - un error de Supabase se propaga como Error con mensaje claro.
// =============================================================================

import { describe, expect, it } from "vitest";
import type { ParametrosMes } from "../core/types";
import type { ServerClient } from "../lib/data/writes";
import { replaceByPais, upsertParams } from "../lib/data/writes";

// ---------------------------------------------------------------------------
// Mock del cliente Supabase
// ---------------------------------------------------------------------------

interface DeleteCall {
  table: string;
  match: Record<string, unknown>;
}
interface InsertCall {
  table: string;
  rows: Array<Record<string, unknown>>;
  options?: { count?: string };
}
interface UpsertCall {
  table: string;
  row: Record<string, unknown>;
  options?: { onConflict?: string };
}

interface MockRecorder {
  deletes: DeleteCall[];
  inserts: InsertCall[];
  upserts: UpsertCall[];
  /** Orden de operaciones por nombre para verificar delete-antes-de-insert. */
  order: string[];
}

interface MockOptions {
  /** Fuerza error en el delete. */
  deleteError?: string;
  /** Fuerza error en el insert. */
  insertError?: string;
  /** count que devuelve el insert (default: nº de filas). */
  insertCount?: number | null;
}

/**
 * Crea un cliente Supabase MOCK con la forma mínima que usa writes.ts. Devuelve
 * también el `recorder` con las llamadas registradas.
 */
function makeMock(opts: MockOptions = {}): {
  sb: ServerClient;
  rec: MockRecorder;
} {
  const rec: MockRecorder = { deletes: [], inserts: [], upserts: [], order: [] };

  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            match(criteria: Record<string, unknown>) {
              rec.deletes.push({ table, match: criteria });
              rec.order.push("delete");
              return Promise.resolve(
                opts.deleteError
                  ? { error: { message: opts.deleteError }, count: null }
                  : { error: null, count: null },
              );
            },
          };
        },
        insert(
          rows: Array<Record<string, unknown>>,
          options?: { count?: string },
        ) {
          rec.inserts.push({ table, rows, options });
          rec.order.push("insert");
          const count =
            opts.insertCount !== undefined ? opts.insertCount : rows.length;
          return Promise.resolve(
            opts.insertError
              ? { error: { message: opts.insertError }, count: null }
              : { error: null, count },
          );
        },
        upsert(
          row: Record<string, unknown>,
          options?: { onConflict?: string },
        ) {
          rec.upserts.push({ table, row, options });
          rec.order.push("upsert");
          return Promise.resolve(
            opts.insertError
              ? { error: { message: opts.insertError } }
              : { error: null },
          );
        },
      };
    },
  };

  // El mock expone solo lo que writes.ts consume; el cast puntual es seguro
  // en el ámbito del test.
  return { sb: client as unknown as ServerClient, rec };
}

// ---------------------------------------------------------------------------
// replaceByPais
// ---------------------------------------------------------------------------

describe("replaceByPais", () => {
  it("borra por (mes,pais) y luego inserta, mapeando egresos → ind_egresos", async () => {
    const { sb, rec } = makeMock();
    const n = await replaceByPais(
      "egresos",
      "2026-07",
      "Costa Rica",
      [
        { mes: "x", pais: "y", nombre: "A", motivo: "Renuncia" },
        { nombre: "B", motivo: "Despido" },
      ],
      sb,
    );

    // Conteo insertado.
    expect(n).toBe(2);

    // DELETE correcto por (mes, pais) sobre la tabla correcta.
    expect(rec.deletes).toHaveLength(1);
    expect(rec.deletes[0].table).toBe("ind_egresos");
    expect(rec.deletes[0].match).toEqual({ mes: "2026-07", pais: "Costa Rica" });

    // INSERT después del delete, con mes/pais fijados por argumentos.
    expect(rec.order).toEqual(["delete", "insert"]);
    expect(rec.inserts).toHaveLength(1);
    expect(rec.inserts[0].table).toBe("ind_egresos");
    expect(rec.inserts[0].options).toEqual({ count: "exact" });
    for (const r of rec.inserts[0].rows) {
      expect(r.mes).toBe("2026-07");
      expect(r.pais).toBe("Costa Rica");
    }
    expect(rec.inserts[0].rows[0].nombre).toBe("A");
  });

  it("mapea activos → ind_colaboradores y sintetiza cédulas vacías/duplicadas", async () => {
    const { sb, rec } = makeMock();
    const n = await replaceByPais(
      "activos",
      "2026-07",
      "Venezuela",
      [
        { cedula: "", nombre: "Sin cédula 0" }, // vacía → __row_0
        { cedula: "123", nombre: "Real" }, // conserva 123
        { cedula: "123", nombre: "Duplicada" }, // duplicada → __row_2
        { cedula: "   ", nombre: "Solo espacios" }, // trim vacío → __row_3
      ],
      sb,
    );

    expect(n).toBe(4);
    expect(rec.deletes[0].table).toBe("ind_colaboradores");
    expect(rec.deletes[0].match).toEqual({ mes: "2026-07", pais: "Venezuela" });

    const rows = rec.inserts[0].rows;
    expect(rows.map((r) => r.cedula)).toEqual([
      "__row_0",
      "123",
      "__row_2",
      "__row_3",
    ]);
    // Todas con mes/pais fijados.
    for (const r of rows) {
      expect(r.mes).toBe("2026-07");
      expect(r.pais).toBe("Venezuela");
    }
  });

  it("con lote vacío solo borra (no inserta) y devuelve 0", async () => {
    const { sb, rec } = makeMock();
    const n = await replaceByPais("terceros", "2026-08", "Costa Rica", [], sb);

    expect(n).toBe(0);
    expect(rec.deletes).toHaveLength(1);
    expect(rec.inserts).toHaveLength(0);
    expect(rec.order).toEqual(["delete"]);
  });

  it("usa la longitud del lote si el backend no reporta count", async () => {
    const { sb } = makeMock({ insertCount: null });
    const n = await replaceByPais(
      "merma",
      "2026-08",
      "Costa Rica",
      [{ area: "A", cantidad: 1 }],
      sb,
    );
    expect(n).toBe(1);
  });

  it("propaga un error de DELETE con mensaje claro y no inserta", async () => {
    const { sb, rec } = makeMock({ deleteError: "permission denied" });
    await expect(
      replaceByPais(
        "egresos",
        "2026-07",
        "Costa Rica",
        [{ nombre: "A" }],
        sb,
      ),
    ).rejects.toThrow(/fallo al borrar.*ind_egresos.*permission denied/);
    expect(rec.inserts).toHaveLength(0);
  });

  it("propaga un error de INSERT con mensaje claro", async () => {
    const { sb } = makeMock({ insertError: "check constraint" });
    await expect(
      replaceByPais(
        "extras",
        "2026-07",
        "Costa Rica",
        [{ horas: 5 }],
        sb,
      ),
    ).rejects.toThrow(/fallo al insertar.*ind_extras.*check constraint/);
  });
});

// ---------------------------------------------------------------------------
// upsertParams
// ---------------------------------------------------------------------------

describe("upsertParams", () => {
  it("hace upsert en ind_parametros_mes con onConflict 'mes,pais'", async () => {
    const { sb, rec } = makeMock();
    const params = { dias_habiles: 21 } as unknown as ParametrosMes;
    await upsertParams("2026-07", "Costa Rica", params, sb);

    expect(rec.upserts).toHaveLength(1);
    expect(rec.upserts[0].table).toBe("ind_parametros_mes");
    expect(rec.upserts[0].options).toEqual({ onConflict: "mes,pais" });
    expect(rec.upserts[0].row).toEqual({
      mes: "2026-07",
      pais: "Costa Rica",
      params,
    });
  });

  it("propaga un error con mensaje claro", async () => {
    const { sb } = makeMock({ insertError: "rls violation" });
    const params = {} as unknown as ParametrosMes;
    await expect(
      upsertParams("2026-07", "Costa Rica", params, sb),
    ).rejects.toThrow(/upsertParams.*fallo al guardar.*rls violation/);
  });
});

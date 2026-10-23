// =============================================================================
// test/ingest.test.ts
//
// Tests unitarios de `lib/io/import/ingest.ts` (tarea 16.4) con un cliente
// Supabase MOCK (no se toca Supabase real). Verifican que:
//   - cargaPais() replica la semántica del index (ROLE/PAIS).
//   - ingestMaster persiste las entidades con reemplazo por país:
//       un master con activos de Costa Rica llama
//       replaceByPais("activos", mes, "Costa Rica", filas, sb)
//       (DELETE sobre ind_colaboradores por (mes, pais), luego INSERT).
//   - el caso "global en Todos" agrupa por país de cada fila.
//   - la satisfacción hace upsert en ind_config_satisfaccion (anio→valor).
// =============================================================================

import { describe, expect, it } from "vitest";
import type { ServerClient } from "../lib/data/writes";
import type {
  EntidadParseada,
  MasterParseResult,
} from "../lib/io/import/read-workbook";
import {
  cargaPais,
  ingestMaster,
  ingestSingle,
} from "../lib/io/import/ingest";

// ---------------------------------------------------------------------------
// Mock del cliente Supabase (misma forma que test/writes.test.ts)
// ---------------------------------------------------------------------------

interface DeleteCall {
  table: string;
  match: Record<string, unknown>;
}
interface InsertCall {
  table: string;
  rows: Array<Record<string, unknown>>;
}
interface UpsertCall {
  table: string;
  rows: Array<Record<string, unknown>>;
  options?: { onConflict?: string };
}

interface MockRecorder {
  deletes: DeleteCall[];
  inserts: InsertCall[];
  upserts: UpsertCall[];
}

function makeMock(): { sb: ServerClient; rec: MockRecorder } {
  const rec: MockRecorder = { deletes: [], inserts: [], upserts: [] };
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            match(criteria: Record<string, unknown>) {
              rec.deletes.push({ table, match: criteria });
              return Promise.resolve({ error: null, count: null });
            },
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          rec.inserts.push({ table, rows });
          return Promise.resolve({ error: null, count: rows.length });
        },
        upsert(
          rows: Array<Record<string, unknown>>,
          options?: { onConflict?: string },
        ) {
          rec.upserts.push({ table, rows, options });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { sb: client as unknown as ServerClient, rec };
}

function emptyMaster(): MasterParseResult {
  return {
    entidades: {},
    parametros: [],
    satisfaccion: {},
    horasHombre: [],
    usadas: [],
    total: 0,
    faltantes: [],
  };
}

// ---------------------------------------------------------------------------
// cargaPais
// ---------------------------------------------------------------------------

describe("cargaPais", () => {
  it("usuario de país devuelve SU país", () => {
    expect(cargaPais({ scope: "pais", paisScope: "Costa Rica" })).toBe(
      "Costa Rica",
    );
  });

  it("global con país seleccionado devuelve ese país", () => {
    expect(
      cargaPais({ scope: "global", paisSeleccionado: "Venezuela" }),
    ).toBe("Venezuela");
  });

  it("global en __all__ devuelve '' (respeta país de cada fila)", () => {
    expect(
      cargaPais({ scope: "global", paisSeleccionado: "__all__" }),
    ).toBe("");
    expect(cargaPais({ scope: "global" })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// ingestMaster — entidades + satisfacción
// ---------------------------------------------------------------------------

describe("ingestMaster", () => {
  it("persiste activos de Costa Rica con replaceByPais sobre ind_colaboradores", async () => {
    const { sb, rec } = makeMock();
    const activos: EntidadParseada = {
      kind: "activos",
      porMes: {
        "2026-07": [
          { id: "1-234", pais: "Costa Rica", nombre: "Ana", fecha_ingreso: "2020-01-01", vac_disfrutadas: "5", vac_pendientes: "2" },
          { id: "5-678", pais: "Costa Rica", nombre: "Luis", fecha_ingreso: "2019-06-01", vac_disfrutadas: "", vac_pendientes: "" },
        ],
      },
      faltantes: [],
    };
    const master = emptyMaster();
    master.entidades.activos = activos;

    const summary = await ingestMaster(master, {
      sb,
      scope: "pais",
      paisScope: "Costa Rica",
    });

    // DELETE por (mes, pais) sobre la tabla de colaboradores.
    expect(rec.deletes).toHaveLength(1);
    expect(rec.deletes[0].table).toBe("ind_colaboradores");
    expect(rec.deletes[0].match).toEqual({ mes: "2026-07", pais: "Costa Rica" });

    // INSERT con mes/pais fijados y numéricos coaccionados.
    expect(rec.inserts).toHaveLength(1);
    expect(rec.inserts[0].table).toBe("ind_colaboradores");
    const rows = rec.inserts[0].rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      cedula: "1-234",
      mes: "2026-07",
      pais: "Costa Rica",
      nombre: "Ana",
      vac_disfrutadas: 5,
      vac_pendientes: 2,
    });
    // Celdas vacías → 0 numérico.
    expect(rows[1].vac_disfrutadas).toBe(0);
    expect(rows[1].vac_pendientes).toBe(0);

    expect(summary.insertadosPorKind.activos).toBe(2);
    expect(summary.mesesTocados).toEqual(["2026-07"]);
    expect(summary.paisesTocados).toEqual(["Costa Rica"]);
  });

  it("aplica la satisfacción con upsert en ind_config_satisfaccion (anio→valor)", async () => {
    const { sb, rec } = makeMock();
    const master = emptyMaster();
    master.satisfaccion = { "2025": 4.1, "2026": 4.3 };

    const summary = await ingestMaster(master, {
      sb,
      scope: "global",
      paisSeleccionado: "__all__",
    });

    expect(rec.upserts).toHaveLength(1);
    expect(rec.upserts[0].table).toBe("ind_config_satisfaccion");
    expect(rec.upserts[0].options).toEqual({ onConflict: "anio" });
    expect(rec.upserts[0].rows).toEqual([
      { anio: 2025, valor: 4.1 },
      { anio: 2026, valor: 4.3 },
    ]);
    expect(summary.satisfaccionAnios).toEqual(["2025", "2026"]);
  });

  it("caso 'global en Todos' agrupa por país de cada fila (un replaceByPais por país)", async () => {
    const { sb, rec } = makeMock();
    const egresos: EntidadParseada = {
      kind: "egresos",
      porMes: {
        "2026-07": [
          { id: "1", pais: "Costa Rica", motivo: "Renuncia" },
          { id: "2", pais: "Venezuela", motivo: "Despido" },
          { id: "3", pais: "Costa Rica", motivo: "Renuncia" },
        ],
      },
      faltantes: [],
    };
    const master = emptyMaster();
    master.entidades.egresos = egresos;

    const summary = await ingestMaster(master, {
      sb,
      scope: "global",
      paisSeleccionado: "__all__",
    });

    // Un DELETE/INSERT por país presente en el archivo.
    expect(rec.deletes).toHaveLength(2);
    const paisesBorrados = rec.deletes.map((d) => d.match.pais).sort();
    expect(paisesBorrados).toEqual(["Costa Rica", "Venezuela"]);
    for (const d of rec.deletes) {
      expect(d.table).toBe("ind_egresos");
      expect(d.match.mes).toBe("2026-07");
    }
    expect(rec.inserts).toHaveLength(2);
    expect(summary.insertadosPorKind.egresos).toBe(3);
    expect(summary.paisesTocados.sort()).toEqual(["Costa Rica", "Venezuela"]);
  });

  it("acumula los campos faltantes por entidad (Req 9.6)", async () => {
    const { sb } = makeMock();
    const master = emptyMaster();
    master.entidades.merma = {
      kind: "merma",
      porMes: { "2026-07": [{ pais: "Costa Rica", area: "A", cantidad: "3" }] },
      faltantes: ["cantidad"],
    };
    const summary = await ingestMaster(master, {
      sb,
      scope: "pais",
      paisScope: "Costa Rica",
    });
    expect(summary.faltantes).toEqual([{ kind: "merma", campos: ["cantidad"] }]);
  });
});

// ---------------------------------------------------------------------------
// ingestSingle
// ---------------------------------------------------------------------------

describe("ingestSingle", () => {
  it("persiste una sola entidad con reemplazo por país", async () => {
    const { sb, rec } = makeMock();
    const entidad: EntidadParseada = {
      kind: "terceros",
      porMes: { "2026-08": [{ pais: "Costa Rica", cantidad: "10" }] },
      faltantes: [],
    };
    const summary = await ingestSingle(entidad, {
      sb,
      scope: "pais",
      paisScope: "Costa Rica",
    });
    expect(rec.deletes[0].table).toBe("ind_terceros");
    expect(rec.inserts[0].rows[0]).toMatchObject({
      mes: "2026-08",
      pais: "Costa Rica",
      cantidad: 10,
    });
    expect(summary.insertadosPorKind.terceros).toBe(1);
  });

  it("rechaza un kind sin país (p.ej. areas) con mensaje claro", async () => {
    const { sb } = makeMock();
    const entidad = {
      kind: "areas",
      porMes: { "2026-08": [{ grupo: "G", area: "A", colaboradores: "4" }] },
      faltantes: [],
    } as unknown as EntidadParseada;
    await expect(
      ingestSingle(entidad, { sb, scope: "pais", paisScope: "Costa Rica" }),
    ).rejects.toThrow(/no tiene país/);
  });
});

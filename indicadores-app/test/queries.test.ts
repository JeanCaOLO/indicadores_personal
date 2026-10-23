// =============================================================================
// test/queries.test.ts
//
// Verifica la capa de LECTURA (`lib/data/queries.ts`) SIN tocar Supabase real.
// Estrategia: un cliente MOCK mínimo que implementa el chaining que usan las
// queries (`from().select().gte().lte().range()`) y devuelve filas simuladas por
// tabla. Comprueba que:
//   - `loadConfig` reconstruye el __cfg desde las tablas de config.
//   - `loadDB` filtra por el rango de meses correcto, pagina con .range() y
//     ensambla un ConfigDB con las filas de los meses recibidas + __cfg.
//   - `loadMes` delega en loadDB del año del mes.
//   - `mesRangeForYear` cubre [year-1 .. year] para desercion12/acumulados.
// =============================================================================

import { describe, expect, it, vi } from "vitest";

import type { ServerClient } from "../lib/data/queries";
import { loadConfig, loadDB, loadMes, mesRangeForYear } from "../lib/data/queries";

// ---------------------------------------------------------------------------
// Cliente mock: devuelve filas por tabla, soportando gte/lte (rango de meses) y
// range() (paginación). Registra las llamadas para verificar el filtrado.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown> & { mes?: string };

interface MockCall {
  table: string;
  gte?: [string, string];
  lte?: [string, string];
  ranges: [number, number][];
}

function makeMockClient(tables: Record<string, Row[]>) {
  const calls: MockCall[] = [];

  function makeBuilder(table: string) {
    const call: MockCall = { table, ranges: [] };
    calls.push(call);
    // Filtros acumulados que se aplican en range().
    const builder = {
      select() {
        return builder;
      },
      gte(col: string, val: string) {
        call.gte = [col, val];
        return builder;
      },
      lte(col: string, val: string) {
        call.lte = [col, val];
        return builder;
      },
      range(from: number, to: number) {
        call.ranges.push([from, to]);
        let rows = tables[table] ?? [];
        // Aplicar rango de meses si se filtró por `mes`.
        if (call.gte && call.gte[0] === "mes") {
          rows = rows.filter((r) => typeof r.mes === "string" && r.mes >= call.gte![1]);
        }
        if (call.lte && call.lte[0] === "mes") {
          rows = rows.filter((r) => typeof r.mes === "string" && r.mes <= call.lte![1]);
        }
        const page = rows.slice(from, to + 1);
        return Promise.resolve({ data: page, error: null });
      },
    };
    return builder;
  }

  const client = {
    from: vi.fn((table: string) => makeBuilder(table)),
  };

  return { client: client as unknown as ServerClient, calls };
}

// Config mínima para armar un __cfg reconocible.
const CONFIG_TABLES: Record<string, Row[]> = {
  ind_config_metas: [
    { kpi: "rot_total", a: 2, b: 4 },
    { kpi: "nuevos", a: null, b: 3 },
  ],
  ind_config_leaders: [{ area: "RRHH", lider: "Ana", correo: "ana@x.com" }],
  ind_config_kpi_off: [{ kpi: "merma_hurto" }],
  ind_config_satisfaccion: [{ anio: 2025, valor: 4.1 }],
  ind_config_kv: [{ key: "sysUrl", value: "https://x" }],
};

describe("mesRangeForYear", () => {
  it("cubre [year-1]-01 .. [year]-12 (arrastre para desercion12 + acumulados)", () => {
    expect(mesRangeForYear(2026)).toEqual({ from: "2025-01", to: "2026-12" });
  });
});

describe("loadConfig", () => {
  it("reconstruye __cfg desde las tablas de config vía el cliente mock", async () => {
    const { client } = makeMockClient({ ...CONFIG_TABLES });
    const cfg = await loadConfig(client);
    expect(cfg.metas.rot_total).toEqual([2, 4]);
    expect(cfg.metas.nuevos).toBeNull();
    expect(cfg.leaders).toHaveLength(1);
    expect(cfg.kpiOff).toEqual(["merma_hurto"]);
    expect(cfg.satisfaccion["2025"]).toBe(4.1);
    expect(cfg.sysUrl).toBe("https://x");
  });
});

describe("loadDB", () => {
  it("filtra por rango de meses, ensambla por mes e inyecta __cfg", async () => {
    const tables: Record<string, Row[]> = {
      ...CONFIG_TABLES,
      ind_colaboradores: [
        // Dentro del rango [2025-01 .. 2026-12].
        { cedula: "A", mes: "2026-07", pais: "Costa Rica", nombre: "A" },
        { cedula: "B", mes: "2026-07", pais: "Costa Rica", nombre: "B" },
        { cedula: "C", mes: "2025-12", pais: "Costa Rica", nombre: "C" },
        // Fuera del rango: NO debe aparecer.
        { cedula: "Z", mes: "2024-06", pais: "Costa Rica", nombre: "Z" },
      ],
      ind_egresos: [{ id: 1, cedula: "E", mes: "2026-07", pais: "Costa Rica" }],
      ind_parametros_mes: [{ mes: "2026-07", pais: "Costa Rica", params: {} }],
    };
    const { client, calls } = makeMockClient(tables);

    const db = await loadDB(2026, client);

    // __cfg inyectado desde loadConfig.
    expect(db.__cfg).toBeDefined();
    expect(db.__cfg.metas.rot_total).toEqual([2, 4]);

    // Agrupa por mes; los meses fuera de rango no aparecen.
    expect(db["2026-07"]).toBeDefined();
    expect(db["2025-12"]).toBeDefined();
    expect(db["2024-06" as `${number}-${number}`]).toBeUndefined();

    // Las filas dentro del rango se agruparon correctamente.
    expect(db["2026-07"].activos).toHaveLength(2);
    expect(db["2025-12"].activos).toHaveLength(1);
    expect(db["2026-07"].egresos).toHaveLength(1);

    // Verifica que las entidades con `mes` se filtraron por el rango esperado.
    const colabCall = calls.find((c) => c.table === "ind_colaboradores");
    expect(colabCall?.gte).toEqual(["mes", "2025-01"]);
    expect(colabCall?.lte).toEqual(["mes", "2026-12"]);
  });

  it("pagina con .range() hasta traer todas las filas (>1000)", async () => {
    // 1500 colaboradores en el mismo mes ⇒ 2 páginas (1000 + 500).
    const many: Row[] = [];
    for (let i = 0; i < 1500; i++) {
      many.push({ cedula: `c${i}`, mes: "2026-03", pais: "Costa Rica", nombre: `n${i}` });
    }
    const { client, calls } = makeMockClient({ ...CONFIG_TABLES, ind_colaboradores: many });

    const db = await loadDB(2026, client);
    expect(db["2026-03"].activos).toHaveLength(1500);

    // `fetchAll` arma una query NUEVA por página (cada .range() es un request
    // independiente), así que el mock registra un MockCall por página. Se
    // esperan 2 páginas: [0,999] y [1000,1999].
    const colabRanges = calls
      .filter((c) => c.table === "ind_colaboradores")
      .flatMap((c) => c.ranges);
    expect(colabRanges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe("loadMes", () => {
  it("delega en loadDB del año del mes y devuelve ese ConfigDB", async () => {
    const tables: Record<string, Row[]> = {
      ...CONFIG_TABLES,
      ind_colaboradores: [{ cedula: "A", mes: "2026-05", pais: "Costa Rica", nombre: "A" }],
    };
    const { client, calls } = makeMockClient(tables);

    const db = await loadMes("2026-05", client);
    expect(db["2026-05"].activos).toHaveLength(1);

    // Usó el rango del año 2026.
    const colabCall = calls.find((c) => c.table === "ind_colaboradores");
    expect(colabCall?.gte).toEqual(["mes", "2025-01"]);
    expect(colabCall?.lte).toEqual(["mes", "2026-12"]);
  });
});

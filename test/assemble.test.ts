// =============================================================================
// test/assemble.test.ts
//
// Verifica la capa de ensamblaje (tarea 9.2) de `lib/data/assemble.ts` SIN
// tocar Supabase. Estrategia: tomar el fixture `db.snapshot.json` (fuente de
// verdad), "desarmarlo" a filas tabulares `ind_*` (simulando exactamente lo que
// la migración escribe y lo que la base devolvería), y comprobar que
// `assembleMesData`/`assembleDB` reconstruyen un MesData/ConfigDB con la forma
// correcta.
//
// Incluye un test de INTEGRACIÓN: desarma 2026-07 a filas, lo re-ensambla, corre
// `compute` con el mismo ctx del golden y verifica hcTot=182 (paridad: la capa
// de ensamblaje preserva el cálculo).
// =============================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compute } from "../core/compute";
import type { ComputeContext, ConfigDB } from "../core/types";
import {
  assembleConfig,
  assembleDB,
  assembleMesData,
  normalizeParams,
  type AssembleDBInput,
  type AssembleMesInput,
} from "../lib/data/assemble";
import type {
  IndAreaRow,
  IndAusenciaRow,
  IndCapacitacionRow,
  IndColaboradorRow,
  IndEgresoRow,
  IndExtraRow,
  IndMermaRow,
  IndParametrosMesRow,
  IndTerceroRow,
  IndVacacionRow,
} from "../supabase/types";

// ---------------------------------------------------------------------------
// Carga del snapshot kv (fuente de verdad)
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "db.snapshot.json"), "utf8"),
) as Record<string, any>;
const GOLDEN = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "expected-kpis.json"), "utf8"),
) as { meta: { today: string }; byMonthPais: Record<string, Record<string, { hcTot: number }>> };

// País por defecto (igual que la migración) cuando una fila no trae país.
const FALLBACK_PAIS = "Costa Rica";
const pais = (r: any): string =>
  typeof r?.pais === "string" && r.pais.trim() !== "" ? r.pais : FALLBACK_PAIS;
const sOrNull = (x: unknown): string | null => {
  if (x == null) return null;
  const v = String(x);
  return v === "" ? null : v;
};
const toNum = (x: unknown): number => {
  const n = +(x as number);
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// "Desarmado": un mes del snapshot → filas ind_* (como las devolvería la base).
// Replica el mapeo de supabase/migrate/migrate-data.ts (incluida la cédula
// sintética __row_<i> para activos sin cédula).
// ---------------------------------------------------------------------------
function disassembleMonth(mes: string, month: any): AssembleMesInput & {
  // Las filas ya con `mes` para poder apilarlas en assembleDB.
  _rows: {
    colaboradores: IndColaboradorRow[];
    egresos: IndEgresoRow[];
    ausencias: IndAusenciaRow[];
    vacaciones: IndVacacionRow[];
    extras: IndExtraRow[];
    capacitacion: IndCapacitacionRow[];
    merma: IndMermaRow[];
    terceros: IndTerceroRow[];
    areas: IndAreaRow[];
    parametros: IndParametrosMesRow[];
  };
} {
  const activos: any[] = Array.isArray(month.activos) ? month.activos : [];
  const colaboradores: IndColaboradorRow[] = activos.map((r, i) => ({
    cedula: typeof r.id === "string" && r.id.trim() !== "" ? r.id.trim() : `__row_${i}`,
    mes,
    pais: pais(r),
    nombre: sOrNull(r.nombre),
    departamento: sOrNull(r.departamento),
    area: sOrNull(r.area),
    sexo: sOrNull(r.sexo),
    fecha_nacimiento: sOrNull(r.fecha_nacimiento),
    fecha_ingreso: sOrNull(r.fecha_ingreso),
    nivel: sOrNull(r.nivel),
    nivel_educativo: sOrNull(r.nivel_educativo),
    carrera: sOrNull(r.carrera),
    movilidad: sOrNull(r.movilidad),
    movimiento: sOrNull(r.movimiento),
    tipo: sOrNull(r.tipo),
    paso: sOrNull(r.paso),
    vac_disfrutadas: toNum(r.vac_disfrutadas),
    vac_pendientes: toNum(r.vac_pendientes),
  }));

  const egresos: IndEgresoRow[] = (month.egresos ?? []).map((r: any, i: number) => ({
    id: i + 1,
    cedula: sOrNull(r.id),
    mes,
    pais: pais(r),
    nombre: sOrNull(r.nombre),
    departamento: sOrNull(r.departamento),
    motivo: sOrNull(r.motivo),
    fecha_ingreso: sOrNull(r.fecha_ingreso),
    fecha_salida: sOrNull(r.fecha_salida),
    movilidad: sOrNull(r.movilidad),
    recomienda: sOrNull(r.recomienda),
  }));

  const ausencias: IndAusenciaRow[] = (month.ausencias ?? []).map((r: any, i: number) => ({
    id: i + 1,
    cedula: sOrNull(r.id),
    mes,
    pais: pais(r),
    nombre: sOrNull(r.nombre),
    departamento: sOrNull(r.departamento),
    tipo: sOrNull(r.tipo),
    dias: toNum(r.dias),
  }));

  const vacaciones: IndVacacionRow[] = (month.vacaciones ?? []).map((r: any, i: number) => ({
    id: i + 1,
    cedula: sOrNull(r.id),
    mes,
    pais: pais(r),
    nombre: sOrNull(r.nombre),
    departamento: sOrNull(r.departamento),
    area: sOrNull(r.area),
    dias: toNum(r.dias),
  }));

  const extras: IndExtraRow[] = (month.extras ?? []).map((r: any, i: number) => ({
    id: i + 1,
    cedula: sOrNull(r.id),
    mes,
    pais: pais(r),
    nombre: sOrNull(r.nombre),
    departamento: sOrNull(r.departamento),
    area: sOrNull(r.area),
    horas: toNum(r.horas),
  }));

  const capacitacion: IndCapacitacionRow[] = (month.capacitacion ?? []).map((r: any, i: number) => ({
    id: i + 1,
    mes,
    pais: pais(r),
    area_conocimiento: sOrNull(r.area_conocimiento),
    curso: sOrNull(r.curso),
    horas: toNum(r.horas),
    participantes: toNum(r.participantes),
  }));

  const merma: IndMermaRow[] = (month.merma ?? []).map((r: any, i: number) => ({
    id: i + 1,
    mes,
    pais: pais(r),
    area: sOrNull(r.area),
    cantidad: toNum(r.cantidad),
  }));

  const terceros: IndTerceroRow[] = (month.terceros ?? []).map((r: any, i: number) => ({
    id: i + 1,
    mes,
    pais: pais(r),
    cantidad: toNum(r.cantidad),
  }));

  const areas: IndAreaRow[] = (month.areas ?? []).map((r: any, i: number) => ({
    id: i + 1,
    mes,
    grupo: sOrNull(r.grupo),
    area: sOrNull(r.area),
    colaboradores: toNum(r.colaboradores),
  }));

  const parametros: IndParametrosMesRow[] = [
    { mes, pais: FALLBACK_PAIS, params: (month.params ?? {}) as any },
  ];

  return {
    colaboradores,
    egresos,
    ausencias,
    vacaciones,
    extras,
    capacitacion,
    merma,
    terceros,
    areas,
    params: (month.params ?? {}) as any,
    _rows: {
      colaboradores,
      egresos,
      ausencias,
      vacaciones,
      extras,
      capacitacion,
      merma,
      terceros,
      areas,
      parametros,
    },
  };
}

// ---------------------------------------------------------------------------
// normalizeParams
// ---------------------------------------------------------------------------
describe("normalizeParams", () => {
  it("garantiza arrays de 5 (rellena con 0) y descarta sobrantes", () => {
    const p = normalizeParams({ hc_indet: [1, 2], hc_det: [1, 2, 3, 4, 5, 6], suc_p45: null });
    expect(p.hc_indet).toEqual([1, 2, 0, 0, 0]);
    expect(p.hc_det).toEqual([1, 2, 3, 4, 5]);
    expect(p.suc_p45).toEqual([0, 0, 0, 0, 0]);
  });

  it("params vacío produce la forma mínima que compute() espera", () => {
    const p = normalizeParams({});
    expect(p.hc_indet).toHaveLength(5);
    expect(p.hc_det).toHaveLength(5);
    expect(p.suc_p45).toHaveLength(5);
    // Escalares que M() fuerza a 0.
    expect(p.mant_cierre).toBe(0);
    expect(p.accidentes).toBe(0);
    expect(p.incidentes).toBe(0);
    expect(p.colab_accid).toBe(0);
    expect(p.mant_plan).toBe(0);
    expect(p.ot_dias).toBe(0);
    expect(p.encuesta).toBe(0);
    expect(p.ruta_basicas).toBe(0);
    expect(p.ruta_tecnicas).toBe(0);
    expect(p.ruta_liderazgo).toBe(0);
    expect(p.horas_hombre).toBe(0);
    // fecha_ult_accidente → "".
    expect(p.fecha_ult_accidente).toBe("");
  });

  it("maneja null/undefined como {} y no revienta", () => {
    expect(normalizeParams(null).hc_indet).toEqual([0, 0, 0, 0, 0]);
    expect(normalizeParams(undefined).fecha_ult_accidente).toBe("");
  });

  it("preserva el resto de params tal cual (coerción la hace el motor)", () => {
    const p = normalizeParams({ prom_colab: "187", vac_fecha: "2026-01-15", dias_habiles: 22 });
    expect(p.prom_colab).toBe("187"); // string preservado, el motor hace +x
    expect(p.vac_fecha).toBe("2026-01-15");
    expect(p.dias_habiles).toBe(22);
  });

  it("no pisa valores existentes de los campos NULL_TO_ZERO con 0", () => {
    const p = normalizeParams({ accidentes: 3, encuesta: 4.2, fecha_ult_accidente: "2026-05-01" });
    expect(p.accidentes).toBe(3);
    expect(p.encuesta).toBe(4.2);
    expect(p.fecha_ult_accidente).toBe("2026-05-01");
  });
});

// ---------------------------------------------------------------------------
// assembleMesData — forma
// ---------------------------------------------------------------------------
describe("assembleMesData (forma)", () => {
  it("reconstruye todas las colecciones y params con arrays de 5", () => {
    const input = disassembleMonth("2026-07", SNAPSHOT["2026-07"]);
    const md = assembleMesData(input);

    // Todas las colecciones presentes como arrays.
    for (const key of [
      "activos",
      "egresos",
      "ausencias",
      "vacaciones",
      "extras",
      "capacitacion",
      "merma",
      "terceros",
      "areas",
    ] as const) {
      expect(Array.isArray(md[key])).toBe(true);
    }

    // Conteos coinciden con el snapshot original.
    expect(md.activos).toHaveLength(SNAPSHOT["2026-07"].activos.length);
    expect(md.egresos).toHaveLength(SNAPSHOT["2026-07"].egresos.length);

    // params con arrays de 5.
    expect(md.params.hc_indet).toHaveLength(5);
    expect(md.params.hc_det).toHaveLength(5);
    expect(md.params.suc_p45).toHaveLength(5);

    // Un colaborador tiene la forma del dominio (id = cédula).
    const c = md.activos[0];
    expect(typeof c.id).toBe("string");
    expect(typeof c.pais).toBe("string");
    expect("fecha_ingreso" in c).toBe(true);
    expect("nivel" in c).toBe(true);
  });

  it("params=null cae a la forma mínima (mes totalmente vacío)", () => {
    const md = assembleMesData({
      colaboradores: [],
      egresos: [],
      ausencias: [],
      vacaciones: [],
      extras: [],
      capacitacion: [],
      merma: [],
      terceros: [],
      areas: [],
      params: null,
    });
    expect(md.activos).toHaveLength(0);
    expect(md.params.hc_indet).toEqual([0, 0, 0, 0, 0]);
    expect(md.params.fecha_ult_accidente).toBe("");
  });

  it("conserva las cédulas sintéticas __row_<i> sin afectar la forma", () => {
    const input = disassembleMonth("2026-07", SNAPSHOT["2026-07"]);
    const md = assembleMesData(input);
    // El fixture trae cédulas vacías ⇒ se vuelven __row_<i> en el desarmado.
    const syn = md.activos.filter((a) => a.id.startsWith("__row_"));
    expect(syn.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// assembleConfig
// ---------------------------------------------------------------------------
describe("assembleConfig", () => {
  it("reconstruye __cfg desde filas de config", () => {
    const cfg = assembleConfig({
      metas: [
        { kpi: "rot_total", a: 2, b: 4 },
        { kpi: "nuevos", a: null, b: 3 }, // meta incompleta → null
      ],
      leaders: [{ area: "RRHH", lider: "Ana", correo: "ana@x.com" }],
      kpiOff: [{ kpi: "merma_hurto" }],
      satisfaccion: [{ anio: 2025, valor: 4.1 }],
      kv: [{ key: "sysUrl", value: "https://x" }],
    });
    expect(cfg.metas.rot_total).toEqual([2, 4]);
    expect(cfg.metas.nuevos).toBeNull();
    expect(cfg.leaders).toHaveLength(1);
    expect(cfg.kpiOff).toEqual(["merma_hurto"]);
    expect(cfg.satisfaccion["2025"]).toBe(4.1);
    expect(cfg.sysUrl).toBe("https://x");
  });
});

// ---------------------------------------------------------------------------
// assembleDB — forma + integración (paridad hcTot=182)
// ---------------------------------------------------------------------------
describe("assembleDB", () => {
  it("agrupa por mes y arma un ConfigDB con la misma forma que el DB original", () => {
    const d07 = disassembleMonth("2026-07", SNAPSHOT["2026-07"])._rows;
    const d09 = disassembleMonth("2026-09", SNAPSHOT["2026-09"])._rows;

    const input: AssembleDBInput = {
      colaboradores: [...d07.colaboradores, ...d09.colaboradores],
      egresos: [...d07.egresos, ...d09.egresos],
      ausencias: [...d07.ausencias, ...d09.ausencias],
      vacaciones: [...d07.vacaciones, ...d09.vacaciones],
      extras: [...d07.extras, ...d09.extras],
      capacitacion: [...d07.capacitacion, ...d09.capacitacion],
      merma: [...d07.merma, ...d09.merma],
      terceros: [...d07.terceros, ...d09.terceros],
      areas: [...d07.areas, ...d09.areas],
      parametros: [...d07.parametros, ...d09.parametros],
      config: { metas: [], leaders: [], kpiOff: [], satisfaccion: [], kv: [] },
    };

    const db = assembleDB(input);
    expect(db.__cfg).toBeDefined();
    expect(db["2026-07"]).toBeDefined();
    expect(db["2026-09"]).toBeDefined();
    // Las filas de 2026-07 se agrupan solo en ese mes.
    expect(db["2026-07"].activos).toHaveLength(SNAPSHOT["2026-07"].activos.length);
    expect(db["2026-09"].activos).toHaveLength(
      (SNAPSHOT["2026-09"].activos ?? []).length,
    );
  });

  it("INTEGRACIÓN: ensamblar 2026-07 y correr compute da hcTot=182 (paridad golden)", () => {
    // Desarmar el año necesario para que M()/desercion12 tengan contexto.
    // Para hcTot basta el propio mes, pero armamos todo el snapshot para fidelidad.
    const all: AssembleDBInput = {
      colaboradores: [],
      egresos: [],
      ausencias: [],
      vacaciones: [],
      extras: [],
      capacitacion: [],
      merma: [],
      terceros: [],
      areas: [],
      parametros: [],
      config: { metas: [], leaders: [], kpiOff: [], satisfaccion: [], kv: [] },
    };
    for (const k of Object.keys(SNAPSHOT)) {
      if (k === "__cfg") continue;
      if (!/^\d{4}-\d{2}$/.test(k)) continue;
      const r = disassembleMonth(k, SNAPSHOT[k])._rows;
      all.colaboradores.push(...r.colaboradores);
      all.egresos.push(...r.egresos);
      all.ausencias.push(...r.ausencias);
      all.vacaciones.push(...r.vacaciones);
      all.extras.push(...r.extras);
      all.capacitacion.push(...r.capacitacion);
      all.merma.push(...r.merma);
      all.terceros.push(...r.terceros);
      all.areas.push(...r.areas);
      all.parametros.push(...r.parametros);
    }

    const db = assembleDB(all) as ConfigDB;
    const ctx: ComputeContext = {
      pais: "__all__",
      dep: "__all__",
      area: "__all__",
      today: new Date(GOLDEN.meta.today),
      dashYear: 2026,
    };
    const res = compute("2026-07", db, ctx);

    const expected = GOLDEN.byMonthPais["2026-07"]["__all__"].hcTot;
    expect(expected).toBe(182); // sanity: golden
    expect(res.hcTot).toBe(182); // la capa de ensamblaje preserva el cálculo
  });
});

// lib/io/export/xlsx.ts
//
// Exportación a Excel (XLSX) de los indicadores y descarga de plantillas.
// Portado desde la fuente de verdad `out/index.html` (solo lectura, NO modificar):
//
//   function _xlsVal(it,v){...}
//   function _kpiAt(it,mk){...}
//   function _fmtX(dec,v){...}
//   function _extraMetrics(mk){...}
//   function dlWorkbook(wb,filename){...}
//   function exportOperativaMes(){...}
//   function exportOperativaAnio(){...}
//   function masterTemplate(){...}
//   function tplSheets(yy,mm){...}
//   function dlTpl(kind){...}
//
// PARIDAD EXACTA: mismas columnas, textos, orden de filas, hojas, nombres de
// hoja, anchos de columna, "freeze", nombres de archivo y la columna ID (cédula)
// en las plantillas de personas (Activos/Egresos/Incapacidades/Permisos/
// Vacaciones/HorasExtra).
//
// CLIENT-SIDE: estas funciones disparan descargas en el navegador (Blob + <a>),
// por eso `xlsx` se carga con DYNAMIC IMPORT dentro de cada función que lo use
// (helper `loadXLSX`), evitando inflar el bundle inicial.
//
// DESACOPLE DE GLOBALES → parámetros:
//   · DB            → `db: ConfigDB`
//   · CUR           → `mes: MonthKey`   (o `yy`/`mm` derivados para plantillas)
//   · PAIS/DEP/AREA → `ctx.pais` / `ctx.dep` / `ctx.area` (ComputeContext)
//   · YEAR          → `year: number`
//   · +CUR.slice(0,4) → `ctx.dashYear`
//   · compute/KPI/KMAP/kpiValid/hasData/M → importados de core/*
//   · toast(...)    → NO va en el módulo (lo maneja la UI). En lugar del guard
//                     `typeof XLSX==="undefined"` usamos el dynamic import.

import { KPI } from "../../../core/kpi-defs";
import { MSHORT, mi, monthsOf } from "../../../core/kpi-defs";
import { compute, M, hasData } from "../../../core/compute";
import { kpiValid } from "../../../core/semaphore";
import type { KpiValidCompute, KpiValidContext } from "../../../core/semaphore";
import type {
  ComputeContext,
  ComputeResult,
  ConfigDB,
  KPI as KpiDef,
  MonthKey,
  ParametrosMes,
} from "../../../core/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ===========================================================================
// Niveles educativos y movilidad para `_extraMetrics`.
// Portado de out/index.html: `const EDUC=[...]` y la lista literal de movilidad.
// ===========================================================================
const EDUC: readonly string[] = ["Primaria", "Secundaria", "Técnico", "Universitario", "Posgrado"];
const MOVIL_X: readonly string[] = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M7 NN"];

// ===========================================================================
// Carga perezosa de `xlsx` (dynamic import). Una sola carga por sesión.
// Reemplaza el guard `typeof XLSX==="undefined"` del index: si falla la carga,
// las funciones de export simplemente no descargan (la UI muestra el aviso).
// ===========================================================================
async function loadXLSX(): Promise<any> {
  const mod: any = await import("xlsx");
  return mod.default ?? mod;
}

// ===========================================================================
// Contexto que estas funciones necesitan (reemplaza PAIS/DEP/AREA/TODAY/dashYear
// del index). Es el `ComputeContext` del motor.
// ===========================================================================
export type ExportCtx = ComputeContext;

/** Etiqueta de país para títulos/nombres de archivo (PAIS → "Consolidado"). */
function paisLabel(pais: string): string {
  return pais === "__all__" ? "Consolidado" : pais;
}

// ===========================================================================
// _xlsVal — `function _xlsVal(it,v){...}`
// Valor numérico listo para la celda según el tipo de KPI.
//   pct → ×100 con 1 decimal; int → redondeo; resto → 1 decimal. null/NaN → "".
// ===========================================================================
export function _xlsVal(it: KpiDef, v: number | null): number | string {
  if (v == null || isNaN(v)) return "";
  if (it.type === "pct") return +(v * 100).toFixed(1);
  if (it.type === "int") return Math.round(v);
  return +(+v).toFixed(1);
}

// ===========================================================================
// _fmtX — `function _fmtX(dec,v){...}`
// Formatea un valor de métrica extra: dec>0 → toFixed(dec); dec=0 → redondeo.
//   ""/null/NaN → "".
// ===========================================================================
export function _fmtX(dec: number, v: any): number | string {
  if (v === "" || v == null || isNaN(+v)) return "";
  return dec ? +(+v).toFixed(dec) : Math.round(+v);
}

// ===========================================================================
// Helper: arma el KpiValidContext a partir del compute result y el mes.
// En el index, `kpiValid(it.k,c)` leía globales (M(CUR).params, satisfacción,
// año, hasData). Aquí se reconstruyen desde `db`/`mes`.
// ===========================================================================
function validCtx(mk: MonthKey, db: ConfigDB): KpiValidContext {
  return {
    params: M(mk, db).params,
    satisfaccion: db.__cfg.satisfaccion,
    year: mk.slice(0, 4),
    hasData: hasData(mk, db),
  };
}

// ===========================================================================
// _kpiAt — `function _kpiAt(it,mk){...}`
// Calcula el valor del KPI `it` para el mes `mk`, o null si el mes no tiene
// datos o el KPI no es válido/mostrable. Replica literalmente:
//   - si !hasData(mk) → null
//   - computa el mes (con CUR=mk en el index; aquí `compute(mk,db,ctx)`)
//   - ok = (info||esl) ? ind[k]!=null : kpiValid(k,c)   (try/catch → ok=false)
//   - caso especial dias_sin_acc: exige params.fecha_ult_accidente
//   - devuelve ind[k] si ok, si no null
// ===========================================================================
export function _kpiAt(it: KpiDef, mk: MonthKey, db: ConfigDB, ctx: ExportCtx): number | null {
  if (!hasData(mk, db)) return null;
  // En el index se usaba CUR=mk; aquí computamos directamente ese mes.
  const c = compute(mk, db, ctx);
  let ok: boolean;
  try {
    ok = it.info || it.esl ? c.ind[it.k] != null : kpiValid(it.k, c as unknown as KpiValidCompute, validCtx(mk, db));
  } catch {
    ok = false;
  }
  if (ok && it.k === "dias_sin_acc") {
    const p: any = (db[mk] && (db[mk] as any).params) || {};
    ok = !!p.fecha_ult_accidente;
  }
  const v = c.ind[it.k];
  return ok ? (v as number | null) : null;
}

// ===========================================================================
// _extraMetrics — `function _extraMetrics(mk){...}`
// Filas de métricas extra del mes: perfil (edad/antigüedad/mujeres/hombres),
// horas hombre (total/ordinarias/extras), nivel educativo, movilidad y terceros.
// Cada fila es [grupo, nombre, unidad, decimales, valor]. Si el mes no tiene
// datos, el valor es "".
// ===========================================================================
export function _extraMetrics(mk: MonthKey, db: ConfigDB, ctx: ExportCtx): any[][] {
  const has = hasData(mk, db);
  let c: ComputeResult | null = null;
  let p: any = {};
  let terc = 0;
  if (has) {
    c = compute(mk, db, ctx);
    p = (db[mk] && (db[mk] as any).params) || {};
    terc = (M(mk, db).terceros || [])
      .filter((x: any) => ctx.pais === "__all__" || (x.pais || "") === ctx.pais)
      .reduce((s: number, x: any) => s + (+x.cantidad || 0), 0);
  }
  const sx: any = (c && (c as any).sexoC) || {};
  const ed: any = (c && (c as any).educC) || {};
  const mv: any = (c && (c as any).movMC) || {};
  const g = (o: any, ks: string[]) => ks.reduce((s, k) => s + +(o[k] || 0), 0);
  const hh = (+p.hh_ord || 0) + (+p.hh_ext || 0) || (+p.horas_hombre || 0);
  const rows: any[][] = [];
  const add = (grp: string, name: string, unit: string, dec: number, val: any) =>
    rows.push([grp, name, unit, dec, has ? val : ""]);
  add("Perfil", "Edad promedio", "años", 1, c ? c.edadProm : "");
  add("Perfil", "Antigüedad promedio", "años", 1, c ? c.antigProm : "");
  add("Perfil", "Mujeres", "", 0, g(sx, ["F", "Femenino", "Mujer", "f"]));
  add("Perfil", "Hombres", "", 0, g(sx, ["M", "Masculino", "Hombre", "m"]));
  add("Horas hombre", "Horas hombre (total)", "h", 0, hh);
  add("Horas hombre", "Horas ordinarias", "h", 0, +p.hh_ord || 0);
  add("Horas hombre", "Horas extras", "h", 0, +p.hh_ext || 0);
  EDUC.forEach((e) => add("Nivel educativo", e, "", 0, ed[e] || 0));
  MOVIL_X.forEach((m) => add("Movilidad", m, "", 0, mv[m] || 0));
  add("Terceros", "Terceros", "", 0, terc);
  return rows;
}

// ===========================================================================
// dlWorkbook — `function dlWorkbook(wb,filename){...}`
// Descarga robusta de un workbook: Blob + XLSX.write(type:"array"); si falla,
// respaldo nativo XLSX.writeFile. Client-side.
// ===========================================================================
export function dlWorkbook(wb: any, filename: string, XLSX: any): boolean {
  if (!XLSX) return false;
  try {
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
    return true;
  } catch (e) {
    console.error("[dlWorkbook]", e);
    // Respaldo: intentar el método nativo
    try {
      XLSX.writeFile(wb, filename);
      return true;
    } catch {
      return false;
    }
  }
}

// ===========================================================================
// exportOperativaMes — `function exportOperativaMes(){...}`
// Excel de indicadores del mes: título, país/período, encabezados
// Grupo/Indicador/Unidad/Valor, "Colaboradores (nómina)", cada KPI (con _kpiAt)
// y las métricas extra (_extraMetrics).
//   Firma nueva: ({ db, mes, pais, ctx }). `pais` sale de ctx.pais pero se
//   acepta explícito para claridad; si no se pasa, se usa ctx.pais.
// ===========================================================================
export interface ExportMesArgs {
  db: ConfigDB;
  mes: MonthKey;
  ctx: ExportCtx;
}

export async function exportOperativaMes({ db, mes, ctx }: ExportMesArgs): Promise<boolean> {
  const XLSX = await loadXLSX();
  const paisLbl = paisLabel(ctx.pais);
  const rows: any[][] = [
    ["OLO · Indicadores de personal"],
    [`País: ${paisLbl}`, `Período: ${MSHORT[mi(mes)]} ${mes.slice(0, 4)}`],
    [],
    ["Grupo", "Indicador", "Unidad", "Valor"],
  ];
  const hc = hasData(mes, db) ? compute(mes, db, ctx).hcTot : null;
  rows.push(["Colaboradores", "Colaboradores (nómina)", "", hc && hc > 0 ? hc : ""]);
  KPI.forEach((grp) =>
    grp.items.forEach((it) => {
      const v = _kpiAt(it, mes, db, ctx);
      rows.push([grp.g, it.name, it.type === "pct" ? "%" : it.unit || "", v == null ? "" : _xlsVal(it, v)]);
    })
  );
  _extraMetrics(mes, db, ctx).forEach((r) => rows.push([r[0], r[1], r[2], _fmtX(r[3], r[4])]));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 40 }, { wch: 8 }, { wch: 12 }];
  ws["!freeze"] = { xSplit: 0, ySplit: 4 };
  XLSX.utils.book_append_sheet(wb, ws, "Indicadores");
  return dlWorkbook(wb, `OLO_${paisLbl.replace(/\s+/g, "_")}_${mes}.xlsx`, XLSX);
}

// ===========================================================================
// exportOperativaAnio — `function exportOperativaAnio(){...}`
// Excel anual: una columna por mes del año + métricas extra por mes.
//   Firma nueva: ({ db, year, ctx }).
// ===========================================================================
export interface ExportAnioArgs {
  db: ConfigDB;
  year: number;
  ctx: ExportCtx;
}

export async function exportOperativaAnio({ db, year, ctx }: ExportAnioArgs): Promise<boolean> {
  const XLSX = await loadXLSX();
  const yr = year;
  const months = monthsOf(yr);
  const paisLbl = paisLabel(ctx.pais);
  const mHead = months.map((mk) => `${MSHORT[mi(mk)]}-${mk.slice(2, 4)}`);
  const rows: any[][] = [
    ["OLO · Indicadores de personal"],
    [`País: ${paisLbl}`, `Año: ${yr}`],
    [],
    ["Grupo", "Indicador", "Unidad", ...mHead],
  ];
  rows.push([
    "Colaboradores",
    "Colaboradores (nómina)",
    "",
    ...months.map((mk) => {
      const h = hasData(mk, db) ? compute(mk, db, ctx).hcTot : null;
      return h && h > 0 ? h : "";
    }),
  ]);
  KPI.forEach((grp) =>
    grp.items.forEach((it) => {
      rows.push([
        grp.g,
        it.name,
        it.type === "pct" ? "%" : it.unit || "",
        ...months.map((mk) => {
          const v = _kpiAt(it, mk, db, ctx);
          return v == null ? "" : _xlsVal(it, v);
        }),
      ]);
    })
  );
  const exByM = months.map((mk) => _extraMetrics(mk, db, ctx));
  if (exByM.length && exByM[0].length) {
    exByM[0].forEach((r0, i) => {
      rows.push([
        r0[0],
        r0[1],
        r0[2],
        ...months.map((_mk, mIdx) => _fmtX(exByM[mIdx][i][3], exByM[mIdx][i][4])),
      ]);
    });
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 40 }, { wch: 8 }, ...months.map(() => ({ wch: 9 }))];
  ws["!freeze"] = { xSplit: 2, ySplit: 4 };
  XLSX.utils.book_append_sheet(wb, ws, String(yr));
  return dlWorkbook(wb, `OLO_${paisLbl.replace(/\s+/g, "_")}_${yr}.xlsx`, XLSX);
}

// ===========================================================================
// Grupos de parámetros (const PGROUPS/PGMAP en out/index.html).
// Portados 1:1 (solo las propiedades que masterTemplate usa: key/fields.l/
// fields.t). masterTemplate construye la fila de ejemplo con los params del mes;
// aquí, como no arrastramos un DB con params, usamos los defaults por tipo
// (num → 0, pct → 0, date/text → "") igual que un mes recién creado.
// ===========================================================================
interface PgField {
  k: string;
  l: string;
  t: "num" | "pct" | "date" | "text";
}
interface PgGroup {
  key: string;
  fields: PgField[];
}

const PGROUPS: PgGroup[] = [
  {
    key: "seleccion",
    fields: [
      { k: "dias_habiles", l: "Días hábiles", t: "num" },
      { k: "prom_colab", l: "Promedio colaboradores", t: "num" },
      { k: "nuevos", l: "Nuevos ingresos", t: "num" },
      { k: "colab_vac", l: "Colaboradores con vacaciones", t: "num" },
      { k: "vac_dias", l: "Suma días de vacante", t: "num" },
      { k: "vac_cant", l: "Número de vacantes", t: "num" },
      { k: "vac_fecha", l: "Fecha de apertura de vacante", t: "date" },
      { k: "of_contactados", l: "Oferentes contactados", t: "num" },
      { k: "of_descartados", l: "Descartados por salario", t: "num" },
      { k: "of_realizadas", l: "Ofertas realizadas", t: "num" },
      { k: "of_rechazadas", l: "Ofertas rechazadas", t: "num" },
      { k: "rot_ini", l: "Colaboradores M4, M5 y M7 NN", t: "num" },
      { k: "rot_egr", l: "Egresados con movilidad", t: "num" },
      { k: "des_ing12", l: "Ingresos 12 meses", t: "num" },
      { k: "des_egr12", l: "Egresos menores a 1 año", t: "num" },
    ],
  },
  {
    key: "clima",
    fields: [{ k: "encuesta", l: "Satisfaccion laboral anual (escala ESL 0-5)", t: "num" }],
  },
  {
    key: "ssl",
    fields: [
      { k: "accidentes", l: "Accidentes laborales", t: "num" },
      { k: "colab_accid", l: "Colaboradores accidentados", t: "num" },
      { k: "fecha_ult_accidente", l: "Fecha ultimo accidente", t: "date" },
      { k: "accid_area", l: "Área del último accidente", t: "text" },
      { k: "merma_hurto", l: "Merma (hurtos reportados)", t: "num" },
      { k: "record_dias", l: "Récord de días sin accidentes", t: "num" },
    ],
  },
  {
    key: "servicios",
    fields: [
      { k: "mant_plan", l: "OT Período (cantidad)", t: "num" },
      { k: "mant_cierre", l: "Ordenes de trabajo cerradas (%)", t: "pct" },
      { k: "ot_dias", l: "Dias promedio para cierre de OT", t: "num" },
      { k: "mant_prev", l: "% Mantenimiento preventivo", t: "num" },
    ],
  },
  {
    key: "bienestar",
    fields: [
      { k: "bien_plan", l: "Actividades planificadas", t: "num" },
      { k: "bien_ejec", l: "Actividades ejecutadas", t: "num" },
      { k: "bien_cumpl", l: "% cumplimiento", t: "pct" },
    ],
  },
  {
    key: "ruta",
    fields: [
      { k: "ruta_basicas", l: "Certificaciones basicas (%)", t: "pct" },
      { k: "ruta_tecnicas", l: "Tecnicas montacargas apiladores transpaletas choferes (%)", t: "pct" },
      { k: "ruta_liderazgo", l: "Liderazgo programa coaching (%)", t: "pct" },
    ],
  },
];
const PGMAP: Record<string, PgGroup> = Object.fromEntries(PGROUPS.map((g) => [g.key, g]));

/** Params por defecto de un mes recién creado (para la fila de ejemplo). */
function defaultParams(db: ConfigDB, mes: MonthKey): ParametrosMes {
  return M(mes, db).params;
}

// ===========================================================================
// masterTemplate — `function masterTemplate(){...}`
// Construye el workbook de la PLANTILLA MAESTRA con todas sus hojas:
// Instrucciones, Activos, Egresos, Incapacidades, Permisos, Vacaciones,
// Capacitacion, HorasExtra, Terceros, MERMA, hojas de parámetros (Seleccion,
// SSL, ServiciosGenerales, PlanAnualBienestar) y Satisfacción, con sus
// encabezados y una fila de ejemplo. INCLUYE la columna ID (cédula) en
// Activos/Egresos/Incapacidades/Permisos/Vacaciones/HorasExtra.
//   Firma nueva: ({ mes, db? }) — solo necesita el mes actual (yy,mm) para la
//   fila de ejemplo y los AÑO/MES, y `db` para la satisfacción y params (opcional).
// ===========================================================================
export interface MasterTemplateArgs {
  mes: MonthKey;
  /** DB para poblar satisfacción y params de ejemplo. Opcional: si falta, se usa un DB vacío. */
  db?: ConfigDB;
}

/** DB mínimo (solo __cfg) para cuando no se pasa uno real. */
function emptyDb(): ConfigDB {
  return { __cfg: { metas: {}, leaders: [], sysUrl: "", kpiOff: [], satisfaccion: {} } } as ConfigDB;
}

export async function masterTemplate({ mes, db }: MasterTemplateArgs): Promise<boolean> {
  const XLSX = await loadXLSX();
  const DB = db ?? emptyDb();
  const wb = XLSX.utils.book_new();
  const yy = mes.slice(0, 4);
  const mm = mes.slice(5, 7);
  const colw = (head: any[]) => ({
    "!cols": head.map((h) => ({ wch: Math.max(11, Math.min(32, String(h).length + 3)) })),
  });
  const S = (name: string, head: any[], data?: any[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(data ? [head, ...data] : [head]);
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    Object.assign(ws, colw(head));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  // Hoja de Instrucciones (primera) — para carga actual e histórica
  const INSTR: any[][] = [
    ["OLO · Plantilla maestra de indicadores de personal"],
    [""],
    ["PARA QUÉ SIRVE"],
    ["Con este único archivo el equipo de cada país registra todos sus datos y los sube a la herramienta."],
    ["Sirve para carga ACTUAL e HISTÓRICA: podés poner varios meses y años en la misma hoja (una fila por registro)."],
    [""],
    ["CÓMO LLENARLA"],
    ["1) No cambies los nombres de las hojas ni los encabezados (primera fila): el sistema los reconoce por esos nombres."],
    ["2) Cada hoja trae columnas AÑO y MES: completalas en CADA fila (ej. AÑO=2026, MES=7). Así cargás varios meses/años juntos."],
    ["3) Una fila por registro (un colaborador en Activos, una salida en Egresos, un caso en Incapacidades, etc.)."],
    ["4) Escribí tus datos a partir de la fila 2 (debajo del encabezado). No dejes filas de ejemplo ni de prueba: todo lo que quede se registra."],
    ["5) Escribí el país tal cual: Costa Rica, Venezuela, Guatemala, El Salvador, Colombia."],
    [""],
    ["AUSENTISMO"],
    ["Incapacidades y Permisos (con o sin goce de salario) cuentan al ausentismo. Las Vacaciones NO cuentan."],
    [""],
    ["CÓMO SUBIRLA"],
    ["En la herramienta: Administrar datos → sección Carga maestra → botón 'Subir carga maestra'."],
    ["El sistema reparte cada hoja y recalcula el tablero. Podés subir el archivo las veces que necesites (reemplaza el mes/país que traiga)."],
    [""],
    ["NOTA"],
    ["'Horas hombre' (Costo por Hora) se carga aparte desde Administrar datos → Horas hombre, por su formato de matriz."],
  ];
  {
    const ws = XLSX.utils.aoa_to_sheet(INSTR);
    ws["!cols"] = [{ wch: 118 }];
    XLSX.utils.book_append_sheet(wb, ws, "Instrucciones");
  }
  S(
    "Activos",
    ["AÑO", "MES", "PAÍS", "ID", "NOMBRE", "DEPARTAMENTO", "ÁREA", "SEXO", "fecha_nacimiento", "fecha_ingreso", "NIVEL", "PASO", "MOVILIDAD", "PROMOCIONES/ASCENSOS", "ACCIÓN", "TIPO", "NIVEL EDUCATIVO", "VACACIONES DE LEY", "VACACIONES ADICIONALES", "VACACIONES ACUMULADAS"],
    [[yy, mm, "Costa Rica", "1-2345-6789", "Juan Pérez", "Logística de Entrada", "Alisto", "M", "1990-05-14", "2020-03-01", 1, "2", "M2", "Promoción", "Asistente", "Indeterminado", "Bachiller en Administración", 12, 4, 16]]
  );
  S(
    "Egresos",
    ["AÑO", "MES", "PAÍS", "ID", "NOMBRE", "DEPARTAMENTO", "MOTIVO", "FECHA_INGRESO", "FECHA_SALIDA", "MOVILIDAD", "RECOMIENDA"],
    [[yy, mm, "Costa Rica", "1-9876-5432", "María Gómez", "Logística de Salida", "Renuncia", "2024-08-10", "2026-06-15", "M5", "Sí"]]
  );
  S(
    "Incapacidades",
    ["AÑO", "MES", "PAÍS", "ID", "NOMBRE", "DEPARTAMENTO", "TIPO", "DÍAS"],
    [[yy, mm, "Costa Rica", "1-1111-2222", "Luis Mora", "Logística", "CCSS", 3]]
  );
  S(
    "Permisos",
    ["ID", "COLABORADOR", "AÑO", "MES", "PAÍS", "DEPARTAMENTO", "ÁREA", "TIPO", "DÍAS"],
    [["1-3333-4444", "Ana Rojas", yy, mm, "Costa Rica", "Logística", "Alisto", "Sin goce de salario", 1]]
  );
  S(
    "Vacaciones",
    ["ID", "COLABORADOR", "AÑO", "MES", "PAÍS", "DEPARTAMENTO", "ÁREA", "VACACIONES DISFRUTADAS AL MES"],
    [["1-2345-6789", "Juan Pérez", yy, mm, "Costa Rica", "Logística", "Alisto", 5]]
  );
  S(
    "Capacitacion",
    ["AÑO", "MES", "PAÍS", "AREA DE CONOCIMIENTO", "CURSO", "PARTICIPANTES", "HORAS"],
    [[yy, mm, "Costa Rica", "Técnicas", "Manejo de montacargas", 22, 16]]
  );
  S(
    "HorasExtra",
    ["ID", "COLABORADOR", "AÑO", "MES", "PAÍS", "DEPARTAMENTO", "ÁREA", "HORAS"],
    [["1-2345-6789", "Juan Pérez", yy, mm, "Costa Rica", "Logística", "Alisto", 120]]
  );
  S("Terceros", ["AÑO", "MES", "PAÍS", "CANTIDAD"], [[yy, mm, "Costa Rica", 0]]);
  S("MERMA", ["AÑO", "MES", "MERMA", "ÁREA"], [[yy, mm, 0, "Alisto"]]);
  const P = (key: string, name: string) => {
    const g = PGMAP[key];
    const p: any = defaultParams(DB, mes);
    const head = ["AÑO", "MES"].concat(g.fields.map((f) => f.l));
    const row = [yy, mm].concat(
      g.fields.map((f) => {
        const v = p[f.k];
        return f.t === "pct" ? +v || 0 : f.t === "date" || f.t === "text" ? v || "" : +v || 0;
      }) as any[]
    );
    S(name, head, [row]);
  };
  P("seleccion", "Seleccion");
  P("ssl", "SSL");
  P("servicios", "ServiciosGenerales");
  P("bienestar", "PlanAnualBienestar");
  // Satisfacción laboral (anual: un puntaje por año)
  {
    const sat: any = (DB.__cfg && DB.__cfg.satisfaccion) || {};
    const yrs = Object.keys(sat).sort();
    const rows: any[][] = (yrs.length ? yrs : [yy]).map((y) => [y, sat[y] != null ? sat[y] : ""]);
    S("SATISFACCIÓN LABORAL", ["AÑO", "PUNTAJE"], rows);
  }
  return dlWorkbook(wb, `plantilla_maestra_OLO_${mes}.xlsx`, XLSX);
}

// ===========================================================================
// tplSheets — `function tplSheets(yy,mm){...}`
// Definición de plantillas individuales por tipo: [sheetName, head, exampleRow].
// INCLUYE la columna ID (cédula) en activos/egresos/ausencias/permisos/
// vacaciones/extras. Portado 1:1.
// ===========================================================================
export function tplSheets(yy: string, mm: string): Record<string, [string, any[], any[]]> {
  return {
    activos: [
      "Activos",
      ["AÑO", "MES", "PAÍS", "ID", "NOMBRE", "DEPARTAMENTO", "ÁREA", "SEXO", "fecha_nacimiento", "fecha_ingreso", "NIVEL", "PASO", "MOVILIDAD", "PROMOCIONES/ASCENSOS", "ACCIÓN", "TIPO", "NIVEL EDUCATIVO", "VACACIONES DE LEY", "VACACIONES ADICIONALES", "VACACIONES ACUMULADAS"],
      [yy, mm, "Costa Rica", "1-2345-6789", "Juan Pérez", "Logística de Entrada", "Alisto", "M", "1990-05-14", "2020-03-01", 1, "2", "M2", "Promoción", "Asistente", "Indeterminado", "Bachiller en Administración", 12, 4, 16],
    ],
    egresos: [
      "Egresos",
      ["AÑO", "MES", "PAÍS", "ID", "NOMBRE", "DEPARTAMENTO", "MOTIVO", "FECHA_INGRESO", "FECHA_SALIDA", "MOVILIDAD", "RECOMIENDAN TRABAJAR EN OLO"],
      [yy, mm, "Costa Rica", "1-9876-5432", "María Gómez", "Logística de Salida", "Renuncia", "2024-08-10", "2026-06-15", "M5", "Sí"],
    ],
    ausencias: [
      "Incapacidades",
      ["AÑO", "MES", "PAÍS", "ID", "NOMBRE", "DEPARTAMENTO", "TIPO", "DÍAS"],
      [yy, mm, "Costa Rica", "1-1111-2222", "Luis Mora", "Logística", "CCSS", 3],
    ],
    capacitacion: [
      "Capacitacion",
      ["AÑO", "MES", "PAÍS", "AREA DE CONOCIMIENTO", "CURSO", "PARTICIPANTES", "HORAS"],
      [yy, mm, "Costa Rica", "Técnicas", "Manejo de montacargas", 22, 16],
    ],
    extras: [
      "HorasExtra",
      ["ID", "COLABORADOR", "AÑO", "MES", "PAÍS", "DEPARTAMENTO", "ÁREA", "HORAS"],
      ["1-2345-6789", "Juan Pérez", yy, mm, "Costa Rica", "Logística de Entrada", "Alisto", 120],
    ],
    vacaciones: [
      "Vacaciones",
      ["ID", "COLABORADOR", "AÑO", "MES", "PAÍS", "DEPARTAMENTO", "ÁREA", "VACACIONES DISFRUTADAS"],
      ["1-2345-6789", "Juan Pérez", yy, mm, "Costa Rica", "Logística de Entrada", "Alisto", 5],
    ],
    permisos: [
      "Permisos",
      ["ID", "COLABORADOR", "AÑO", "MES", "PAÍS", "DEPARTAMENTO", "ÁREA", "TIPO", "DÍAS"],
      ["1-3333-4444", "Ana Rojas", yy, mm, "Costa Rica", "Logística", "Alisto", "Sin goce de salario", 1],
    ],
    terceros: ["Terceros", ["AÑO", "MES", "PAÍS", "CANTIDAD"], [yy, mm, "Costa Rica", 8]],
  };
}

// ===========================================================================
// dlTpl — `function dlTpl(kind){...}`
// Descarga la plantilla de un tipo. Con xlsx disponible genera un .xlsx de una
// hoja (head + fila ejemplo); como respaldo (sin xlsx) genera un .csv.
//   Firma nueva: (kind, { mes }).
// ===========================================================================
export interface DlTplArgs {
  mes: MonthKey;
}

export async function dlTpl(kind: string, { mes }: DlTplArgs): Promise<boolean> {
  const yy = mes.slice(0, 4);
  const mm = mes.slice(5, 7);
  const def = tplSheets(yy, mm)[kind];
  if (!def) return false;
  const sheetName = def[0];
  const head = def[1];
  const row = def[2];
  // Intentar xlsx (dynamic import). Si falla, respaldo CSV.
  let XLSX: any = null;
  try {
    XLSX = await loadXLSX();
  } catch {
    XLSX = null;
  }
  if (XLSX) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([head, row]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return dlWorkbook(wb, `plantilla_${sheetName}_${mes}.xlsx`, XLSX);
  }
  const esc = (v: any) => {
    v = String(v == null ? "" : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const csv = head.map(esc).join(",") + "\n" + row.map(esc).join(",") + "\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `plantilla_${sheetName}_${mes}.csv`;
  a.click();
  return true;
}

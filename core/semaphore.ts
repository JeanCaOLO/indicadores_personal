// core/semaphore.ts
//
// Clasificación de valores de KPI (semáforo), bandas de la Escala ESL y
// validez de un KPI para mostrarse. Portado LÍNEA POR LÍNEA desde la fuente de
// verdad `out/index.html` (solo lectura, no modificar):
//
//   function meta(it){const m=CFG().metas[it.k];return(m&&m.length===2&&m[0]!=null)?m:it.t;}
//   function sem(it,v,valid){if(!valid)return"na";const[a,b]=meta(it);return it.lower?(v<=a?"ok":v<=b?"warn":"danger"):(v>=b?"ok":v>=a?"warn":"danger");}
//   function eslBand(v){v=+v||0;
//     if(v<3.88)return{name:"Deficiente",color:"#E4483C"};
//     if(v<4.02)return{name:"Inferior",color:"#F291BE"};
//     if(v<4.29)return{name:"Promedio",color:"#F2C40F"};
//     if(v<4.43)return{name:"Superior",color:"#49A94B"};
//     return{name:"Excelente",color:"#1F7EC2"};}
//   function kpiValid(key,c){const p=M(CUR).params; ... }
//
// Paridad EXACTA: mismos cortes ESL (3.88 / 4.02 / 4.29 / 4.43), mismos colores,
// misma lógica `lower`/no-`lower` del semáforo y mismas condiciones de validez.
//
// CAMBIOS DE FIRMA (eliminación de globales CFG/DB/M/CUR/hasData):
//   - meta(it)            → meta(it, metas)
//       En el index lee `CFG().metas[it.k]`. Aquí recibe `metas`
//       (ConfigGlobal["metas"]) como parámetro. Lógica idéntica.
//   - sem(it,v,valid)     → sem(it, v, valid, metas)
//       `sem` depende de `meta`, así que propaga `metas` en lugar del global.
//   - eslBand(v)          → eslBand(v)   (sin cambios: no usaba globales)
//   - kpiValid(key,c)     → kpiValid(key, c, ctx)
//       En el index `kpiValid` lee globales (`M(CUR).params`, `CUR`,
//       `DB.__cfg.satisfaccion`, `hasData(CUR)`). Aquí esos accesos se reciben
//       en `ctx: KpiValidContext` { params, satisfaccion, year, hasData }:
//         · `M(CUR).params`                    → ctx.params
//         · `DB.__cfg.satisfaccion[CUR.slice(0,4)]` → ctx.satisfaccion[ctx.year]
//         · `hasData(CUR)`                     → ctx.hasData
//       La lógica de cada rama se preserva tal cual.

import type { ConfigGlobal, KPI, ParametrosMes } from "./types";

/** Clasificación del semáforo: ok (verde), warn (amarillo), danger (rojo), na. */
export type SemStatus = "ok" | "warn" | "danger" | "na";

/** Banda de la Escala ESL (nombre + color). */
export interface EslBandResult {
  name: string;
  color: string;
}

/**
 * Umbrales efectivos `[a,b]` del KPI.
 * Port de `function meta(it){const m=CFG().metas[it.k];return(m&&m.length===2&&m[0]!=null)?m:it.t;}`
 * Cambio de firma: en vez de leer el global `CFG().metas`, recibe `metas`.
 */
export function meta(it: KPI, metas: ConfigGlobal["metas"]): [number, number] | undefined {
  const m = metas[it.k];
  return m && m.length === 2 && m[0] != null ? m : it.t;
}

/**
 * Clasificación del semáforo de un valor de KPI.
 * Port de `function sem(it,v,valid){if(!valid)return"na";const[a,b]=meta(it);return it.lower?(v<=a?"ok":v<=b?"warn":"danger"):(v>=b?"ok":v>=a?"warn":"danger");}`
 * Cambio de firma: propaga `metas` (lo usa `meta`).
 */
export function sem(it: KPI, v: number, valid: boolean, metas: ConfigGlobal["metas"]): SemStatus {
  if (!valid) return "na";
  const [a, b] = meta(it, metas)!;
  return it.lower ? (v <= a ? "ok" : v <= b ? "warn" : "danger") : v >= b ? "ok" : v >= a ? "warn" : "danger";
}

/**
 * Banda de la Escala ESL (satisfacción laboral, escala 0–5).
 * Port EXACTO de `function eslBand(v){...}`: cortes 3.88 / 4.02 / 4.29 / 4.43 y colores.
 * Sin cambios de firma (no usaba globales).
 */
export function eslBand(v: number): EslBandResult {
  v = +v || 0;
  if (v < 3.88) return { name: "Deficiente", color: "#E4483C" };
  if (v < 4.02) return { name: "Inferior", color: "#F291BE" };
  if (v < 4.29) return { name: "Promedio", color: "#F2C40F" };
  if (v < 4.43) return { name: "Superior", color: "#49A94B" };
  return { name: "Excelente", color: "#1F7EC2" };
}

/**
 * Datos del compute (`c`) que consume `kpiValid`.
 * Replica los campos leídos del resultado de `compute()` en el index.
 */
export interface KpiValidCompute {
  diasLab: number;
  inc: number;
  raw: Record<string, [number, number]>;
  prom: number;
  cursos: unknown[];
  capHoras: number;
  hcTot: number;
  edadProm: number;
  antigProm: number;
  rosterOwnN: number;
  movimStatus: unknown;
  movimOwn: Record<string, unknown>;
  diasSinAcc: number | null;
}

/**
 * Contexto que reemplaza los globales leídos por `kpiValid` en el index:
 *   - params        → `M(CUR).params`
 *   - satisfaccion  → `DB.__cfg.satisfaccion`
 *   - year          → `CUR.slice(0,4)` (clave de año para `satisfaccion`)
 *   - hasData       → `hasData(CUR)` (true si el mes actual tiene datos)
 */
export interface KpiValidContext {
  params: ParametrosMes;
  satisfaccion: ConfigGlobal["satisfaccion"];
  year: string;
  hasData: boolean;
}

/**
 * Determina si un KPI tiene valor válido para mostrarse (si no, la UI lo pinta
 * como no disponible `na`).
 * Port de `function kpiValid(key,c){const p=M(CUR).params; ... }`.
 * Cambio de firma: los globales se reciben en `ctx` (ver KpiValidContext).
 */
export function kpiValid(key: string, c: KpiValidCompute, ctx: KpiValidContext): boolean {
  const p = ctx.params;
  if (key === "ausentismo") return c.diasLab > 0 && c.inc > 0;
  if (key === "descarte") return +p.of_contactados > 0;
  if (key === "efectividad") return +p.of_realizadas > 0;
  if (key === "dias_vacante") return +p.vac_cant > 0;
  if (key === "vacante_activa") return !!p.vac_fecha;
  if (key === "desercion") return c.raw.desercion[1] > 0;
  if (key === "rot_indeseada") return c.raw.rot_indeseada[1] > 0;
  if (key === "vac_cobertura") return c.raw.vac_cobertura[1] > 0;
  if (key === "mant") return +p.mant_cierre > 0;
  if (key === "mant_plan") return +p.mant_plan > 0;
  if (key === "ot_dias") return +p.ot_dias > 0;
  if (key === "accid_pct") return c.prom > 0;
  if (key === "accidentes" || key === "incidentes") return ctx.hasData;
  if (key === "cap_horas" || key === "cap_cursos") return c.cursos.length > 0;
  if (key === "cap_hxc") return c.capHoras > 0 && (c.hcTot > 0 || +p.prom_colab > 0);
  if (key === "edad_prom") return c.edadProm > 0;
  if (key === "antig_prom") return c.antigProm > 0;
  if (key === "promo_asc" || key === "promo" || key === "ascenso")
    return c.rosterOwnN > 0 && !c.movimStatus && Object.keys(c.movimOwn).length > 0;
  if (key === "encuesta") return +p.encuesta > 0 || +ctx.satisfaccion[ctx.year] > 0;
  if (key === "merma_hurto") return true;
  if (key === "dias_sin_acc") return c.diasSinAcc != null;
  if (key === "record_dias") return +p.record_dias > 0;
  return c.prom > 0 || c.hcTot > 0;
}

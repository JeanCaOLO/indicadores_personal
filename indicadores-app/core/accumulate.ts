// core/accumulate.ts
//
// Vista acumulada (YTD) de los KPIs. Porta LÍNEA POR LÍNEA desde la fuente de
// verdad `out/index.html` (solo lectura, no modificar):
//
//   function accValue(itk,k){
//     const upto=MONTHS.slice(0,mi(k)+1).filter(hasData);
//     if(ACC_RATIO.includes(itk)){let n=0,d=0;upto.forEach(m=>{const r=compute(m).raw[itk];if(r){n+=r[0];d+=r[1];}});return safe(n,d);}
//     if(ACC_SUM.includes(itk)){let n=0;upto.forEach(m=>{const r=compute(m).raw[itk];if(r)n+=r[0];});return n;}
//     return compute(k).ind[itk]; // snapshot
//   }
//   function valOf(it,k){return VIEW==="acum"?accValue(it.k,k):compute(k).ind[it.k];}
//
// Paridad EXACTA de la lógica de acumulado:
//   · Se acumula solo sobre los meses que van de enero hasta `k` y que tienen
//     datos (`hasData`).
//   · ACC_RATIO: suma por separado numerador y denominador de `compute(m).raw[itk]`
//     y devuelve `safe(n, d)`.
//   · ACC_SUM: suma solo los numeradores `compute(m).raw[itk][0]`.
//   · Resto: devuelve el snapshot `compute(k).ind[itk]`.
//
// CAMBIOS DE FIRMA (eliminación de globales MONTHS/VIEW/compute/hasData):
//   El index.html usa los globales `MONTHS` (= monthsOf(YEAR)), `VIEW`,
//   `compute` y `hasData`, además del helper global `safe`. `compute` todavía
//   NO está portado (tarea 4.16), así que para no acoplar mal ni crear un import
//   roto, `compute` y `hasData` entran por INYECCIÓN de dependencia:
//     · MONTHS      → opts.months   (las 12 claves "YYYY-MM" del año del dashboard)
//     · VIEW        → parámetro `view` de valOf
//     · compute     → opts.compute  (ComputeFn, inyectada)
//     · hasData     → opts.hasData  (HasDataFn, inyectada)
//     · safe(n,d)   → helper local idéntico al del index: `d>0?n/d:0`
//   `ACC_RATIO`, `ACC_SUM` y `mi` se importan de "./kpi-defs".

import { ACC_RATIO, ACC_SUM, mi } from "./kpi-defs";
import type {
  ComputeContext,
  ComputeResult,
  ConfigDB,
  KPI,
  MonthKey,
} from "./types";

// ===========================================================================
// Tipos de las dependencias inyectadas.
// No tocan la firma real de `compute` (que se portará en la tarea 4.16); solo
// declaran la forma de función que accumulate.ts espera recibir.
// ===========================================================================

/** Firma esperada de la función `compute` (se portará en 4.16). */
export type ComputeFn = (
  k: MonthKey,
  db: ConfigDB,
  ctx: ComputeContext,
) => ComputeResult;

/** Firma esperada de la función `hasData`. */
export type HasDataFn = (k: MonthKey, db: ConfigDB) => boolean;

/** Vista activa del dashboard (reemplaza el global `VIEW`). */
export type View = "mes" | "acum" | "comp";

/** Dependencias/contexto inyectados a los acumuladores. */
export interface AccumulateOpts {
  db: ConfigDB;
  ctx: ComputeContext;
  /** Las 12 claves "YYYY-MM" del año del dashboard (reemplaza MONTHS). */
  months: MonthKey[];
  compute: ComputeFn;
  hasData: HasDataFn;
}

// ===========================================================================
// Helper local `safe` — idéntico al global del index.html:
//   function safe(n,d){return d>0?n/d:0;}
// ===========================================================================
function safe(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

// ===========================================================================
// accValue — valor acumulado (YTD) de un KPI hasta el mes `k`.
//   Porta `function accValue(itk,k)` del index.html.
// ===========================================================================
export function accValue(
  itk: string,
  k: MonthKey,
  opts: AccumulateOpts,
): number | null {
  const { db, ctx, months, compute, hasData } = opts;
  // const upto=MONTHS.slice(0,mi(k)+1).filter(hasData);
  const upto = months.slice(0, mi(k) + 1).filter((m) => hasData(m, db));
  if (ACC_RATIO.includes(itk)) {
    // ACC_RATIO: suma [num,den] por separado y aplica safe(n,d).
    let n = 0,
      d = 0;
    upto.forEach((m) => {
      const r = compute(m, db, ctx).raw[itk];
      if (r) {
        n += r[0];
        d += r[1];
      }
    });
    return safe(n, d);
  }
  if (ACC_SUM.includes(itk)) {
    // ACC_SUM: suma solo numeradores.
    let n = 0;
    upto.forEach((m) => {
      const r = compute(m, db, ctx).raw[itk];
      if (r) n += r[0];
    });
    return n;
  }
  // Resto: snapshot del mes k.
  return compute(k, db, ctx).ind[itk]; // snapshot
}

// ===========================================================================
// valOf — valor a mostrar de un KPI: acumulado (VIEW==="acum") o snapshot.
//   Porta `function valOf(it,k)` del index.html.
// ===========================================================================
export function valOf(
  it: KPI,
  k: MonthKey,
  view: View,
  opts: AccumulateOpts,
): number | null {
  return view === "acum"
    ? accValue(it.k, k, opts)
    : opts.compute(k, opts.db, opts.ctx).ind[it.k];
}

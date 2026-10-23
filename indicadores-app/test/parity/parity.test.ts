// test/parity/parity.test.ts
//
// Tarea 6.2 — VALIDACIÓN FORMAL de paridad numérica del motor portado.
//
// **Property 1: Paridad numérica con el sistema actual (model-based)**
// **Validates: Requirements 1.4, 18.1, 18.2, 18.3, 18.4**
//
// Por cada celda (mes, país) del golden `expected-kpis.json` comparamos, con las
// tolerancias del requisito (int exacto; float 1e-6; null significativo):
//   · MENSUAL   → compute(mes).ind[clave]   vs  cell.ind[clave]      (33 claves)
//   · RAW       → compute(mes).raw[clave]   vs  cell.raw[clave]      (15 pares)
//   · ACUMULADO → accValue(clave, mes)      vs  cell.acc[clave]      (33 claves)
//   · DERIVADOS → hcTot, prom (int exacto); edadProm, antigProm (1e-6);
//                 diasSinAcc (int o null)  vs  cell.*
//
// El golden generó `acc` con accValue para TODAS las claves de ind (accValue cae
// a snapshot para las no-acumulables), así que replicamos exactamente lo mismo.
//
// Un `it` por celda que recorre TODAS las claves y acumula los fallos: si algo
// difiere, el mensaje lista exactamente (sección, clave, mes, país, motor vs
// golden, motivo), para diagnosticar y corregir el motor (nunca el test).

import { describe, it, expect } from "vitest";

import { compute, hasData } from "../../core/compute";
import { accValue, type AccumulateOpts } from "../../core/accumulate";
import { monthsOf } from "../../core/kpi-defs";
import type { ComputeContext, MonthKey } from "../../core/types";

import { compareValue, compareRawPair } from "./compare";
import {
  loadDB,
  loadGolden,
  makeCtx,
  type GoldenCell,
  type RawPair,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Fixtures (lectura única, cacheada en los helpers)
// ---------------------------------------------------------------------------
const db = loadDB();
const golden = loadGolden();

/** Año del dashboard a partir de la clave de mes "YYYY-MM". */
function yearOf(mes: string): number {
  return +mes.slice(0, 4);
}

/** Construye las opts que `accValue` espera para un (pais, dashYear). */
function accOpts(ctx: ComputeContext, dashYear: number): AccumulateOpts {
  return {
    db,
    ctx,
    months: monthsOf(dashYear),
    compute,
    hasData,
  };
}

// Contadores globales de aserciones realizadas (para el reporte final).
let cmpMensual = 0;
let cmpRaw = 0;
let cmpAcc = 0;
let cmpDeriv = 0;
let cmpCeldas = 0;

describe("Property 1: Paridad numérica con el sistema actual (model-based)", () => {
  const months = golden.meta.months;

  for (const mes of months) {
    const paisesCell = golden.byMonthPais[mes];
    if (!paisesCell) continue;

    for (const pais of Object.keys(paisesCell)) {
      const cell: GoldenCell = paisesCell[pais];
      const dashYear = yearOf(mes);

      it(`${mes} · ${pais} — paridad de todas las claves`, () => {
        const ctx = makeCtx(pais, dashYear);
        const c = compute(mes as MonthKey, db, ctx);
        const opts = accOpts(ctx, dashYear);

        // Fallos acumulados de ESTA celda (cada entrada es un string legible).
        const fails: string[] = [];

        // ---- MENSUAL (ind) ------------------------------------------------
        for (const key of Object.keys(cell.ind)) {
          const res = compareValue(key, c.ind[key], cell.ind[key]);
          cmpMensual++;
          if (!res.ok) {
            fails.push(
              `[ind]  ${mes}/${pais}  motor=${fmt(c.ind[key])}  golden=${fmt(
                cell.ind[key],
              )}  → ${res.reason}`,
            );
          }
        }

        // ---- RAW ([num, den]) --------------------------------------------
        for (const key of Object.keys(cell.raw)) {
          const actual = c.raw[key] as RawPair | undefined;
          const res = compareRawPair(key, actual, cell.raw[key]);
          cmpRaw++;
          if (!res.ok) {
            fails.push(
              `[raw]  ${mes}/${pais}  motor=${fmtPair(actual)}  golden=${fmtPair(
                cell.raw[key],
              )}  → ${res.reason}`,
            );
          }
        }

        // ---- ACUMULADO (acc, YTD) ----------------------------------------
        // El golden generó `acc` con accValue para TODAS las claves de ind;
        // replicamos: accValue cae a snapshot para las no-acumulables.
        for (const key of Object.keys(cell.acc)) {
          const actual = accValue(key, mes as MonthKey, opts);
          const res = compareValue(key, actual, cell.acc[key]);
          cmpAcc++;
          if (!res.ok) {
            fails.push(
              `[acc]  ${mes}/${pais}  motor=${fmt(actual)}  golden=${fmt(
                cell.acc[key],
              )}  → ${res.reason}`,
            );
          }
        }

        // ---- DERIVADOS ----------------------------------------------------
        // hcTot, prom → int exacto ; edadProm, antigProm → float 1e-6 ;
        // diasSinAcc → int o null.
        const derivedChecks: Array<[string, number | null, number | null]> = [
          ["hcTot", c.hcTot, cell.hcTot],
          ["prom", c.prom, cell.prom],
          ["edadProm", c.edadProm, cell.edadProm],
          ["antigProm", c.antigProm, cell.antigProm],
          ["diasSinAcc", c.diasSinAcc, cell.diasSinAcc],
        ];
        for (const [key, actual, expected] of derivedChecks) {
          const res = compareValue(key, actual, expected);
          cmpDeriv++;
          if (!res.ok) {
            fails.push(
              `[deriv]  ${mes}/${pais}  motor=${fmt(actual)}  golden=${fmt(
                expected,
              )}  → ${res.reason}`,
            );
          }
        }

        cmpCeldas++;

        // Reporte EXACTO de discrepancias (no se maquilla el test).
        if (fails.length) {
          const header = `Paridad rota en ${mes}/${pais}: ${fails.length} discrepancia(s)`;
          throw new Error(`${header}\n${fails.join("\n")}`);
        }
      });
    }
  }

  // Resumen final: confirma el volumen de comparaciones realizadas.
  it("resumen de comparaciones (celdas y claves)", () => {
    const total = cmpMensual + cmpRaw + cmpAcc + cmpDeriv;
    // eslint-disable-next-line no-console
    console.log(
      `[paridad] celdas=${cmpCeldas}  mensual=${cmpMensual}  raw=${cmpRaw}  ` +
        `acumulado=${cmpAcc}  derivados=${cmpDeriv}  total=${total}`,
    );
    // Debe haberse comparado al menos una celda con todas sus secciones.
    expect(cmpCeldas).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Formateadores para los mensajes de diagnóstico.
// ---------------------------------------------------------------------------
function fmt(v: number | null | undefined): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  return String(v);
}

function fmtPair(v: RawPair | null | undefined): string {
  if (v == null) return String(v);
  return `[${v[0]}, ${v[1]}]`;
}

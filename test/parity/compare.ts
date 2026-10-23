// test/parity/compare.ts
//
// Comparador con tolerancias para los tests de paridad (tareas 6.1 y 6.2).
//
// Reglas (Req 18.2, 18.3):
//   - `null` es significativo: si expected == null, ok sólo si actual == null.
//   - KPIs de tipo "int" → igualdad EXACTA.
//   - KPIs de tipo float ("pct"/"days"/"num" y derivados como edad/antigüedad)
//     → |actual - expected| <= EPS (1e-6).
//   - actual/expected ausentes o NaN → fallo con un `reason` claro.
//   - compareRawPair: compara pares [num, den] componente a componente (float).
//
// El tipo de cada clave se resuelve con `kpiTypeOf(key)`, que consulta KMAP para
// las 27 claves del array KPI y clasifica las ~6 claves derivadas extra que el
// motor también produce (vacante_activa, accid_pct, colab_accid_n, incidentes,
// edad_prom, antig_prom, promo_asc, …) según su naturaleza entera o float.

import { KMAP } from "../../core/kpi-defs";
import type { KpiType } from "../../core/types";

/** Tolerancia absoluta para comparaciones de punto flotante. */
export const EPS = 1e-6;

/** Resultado de una comparación: ok + motivo opcional cuando falla. */
export interface CompareResult {
  ok: boolean;
  reason?: string;
}

/**
 * Categoría efectiva de una clave para comparar:
 *   - "int"   → igualdad exacta
 *   - "float" → tolerancia EPS
 */
export type CompareKind = "int" | "float";

// Claves derivadas (fuera del array KPI) que el motor produce en `ind`/`acc` y
// que deben tratarse como ENTEROS (conteos / días redondeados).
const EXTRA_INT_KEYS: ReadonlySet<string> = new Set([
  "hcTot",
  "prom",
  "cap_cursos",
  "accidentes",
  "dias_sin_acc",
  "record_dias",
  "colab_accid_n",
  "incidentes",
  "merma_hurto",
  "vacante_activa",
]);

// Claves derivadas que deben tratarse como FLOAT (promedios / ratios / %).
const EXTRA_FLOAT_KEYS: ReadonlySet<string> = new Set([
  "edadProm",
  "antigProm",
  "edad_prom",
  "antig_prom",
  "accid_pct",
  "promo_asc",
  "cap_hxc",
]);

/**
 * Resuelve la categoría de comparación de una clave.
 *
 * Precedencia:
 *   1. Si la clave es un KPI del array (KMAP) → su `type` ("int" exacto; el
 *      resto —"pct"/"days"/"num"— float).
 *   2. Si está en EXTRA_INT_KEYS → "int".
 *   3. Si está en EXTRA_FLOAT_KEYS → "float".
 *   4. Por defecto → "float" (seguro: tolerancia en vez de exactitud).
 */
export function kpiTypeOf(key: string): CompareKind {
  const def = KMAP[key];
  if (def) {
    return def.type === "int" ? "int" : "float";
  }
  if (EXTRA_INT_KEYS.has(key)) return "int";
  if (EXTRA_FLOAT_KEYS.has(key)) return "float";
  return "float";
}

/** `true` si el valor es un número finito (descarta null, undefined, NaN, ∞). */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Compara un valor del motor (`actual`) contra el golden (`expected`) para una
 * clave dada, aplicando las tolerancias del requisito 18.2/18.3.
 *
 * @param key      Clave del indicador (p.ej. "rot_total", "dias_sin_acc").
 * @param actual   Valor producido por el motor portado.
 * @param expected Valor del golden (vara de validación).
 * @param kind     Categoría opcional; si se omite se resuelve con kpiTypeOf(key).
 */
export function compareValue(
  key: string,
  actual: number | null | undefined,
  expected: number | null | undefined,
  kind: CompareKind = kpiTypeOf(key),
): CompareResult {
  // null/undefined en el golden → coincide SÓLO si actual también es nulo.
  if (expected == null) {
    return actual == null
      ? { ok: true }
      : { ok: false, reason: `${key}: golden es null pero el motor devolvió ${String(actual)}` };
  }

  // El golden tiene valor numérico pero el motor no produjo uno.
  if (actual == null) {
    return { ok: false, reason: `${key}: motor devolvió null/undefined pero el golden es ${expected}` };
  }

  if (!isFiniteNumber(expected)) {
    return { ok: false, reason: `${key}: valor esperado no finito (${String(expected)})` };
  }
  if (!isFiniteNumber(actual)) {
    return { ok: false, reason: `${key}: valor del motor no finito (${String(actual)})` };
  }

  if (kind === "int") {
    if (actual === expected) return { ok: true };
    return { ok: false, reason: `${key}: int esperado ${expected}, motor ${actual}` };
  }

  // float: tolerancia absoluta EPS.
  const diff = Math.abs(actual - expected);
  if (diff <= EPS) return { ok: true };
  return {
    ok: false,
    reason: `${key}: |${actual} - ${expected}| = ${diff} > ${EPS}`,
  };
}

/**
 * Compara dos pares `raw` [num, den] componente a componente, con tolerancia
 * EPS en cada componente (ambos son números, no enteros exactos).
 */
export function compareRawPair(
  key: string,
  actual: readonly [number, number] | null | undefined,
  expected: readonly [number, number] | null | undefined,
): CompareResult {
  if (expected == null) {
    return actual == null
      ? { ok: true }
      : { ok: false, reason: `${key}.raw: golden es null pero el motor devolvió un par` };
  }
  if (actual == null) {
    return { ok: false, reason: `${key}.raw: motor devolvió null pero el golden es [${expected[0]}, ${expected[1]}]` };
  }

  const num = compareValue(`${key}.raw[num]`, actual[0], expected[0], "float");
  if (!num.ok) return num;
  const den = compareValue(`${key}.raw[den]`, actual[1], expected[1], "float");
  if (!den.ok) return den;
  return { ok: true };
}

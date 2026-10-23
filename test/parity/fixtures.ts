// test/parity/fixtures.ts
//
// Cargador de fixtures golden para los tests de paridad (tareas 6.1 y 6.2).
//
// Expone:
//   - loadDB():      el snapshot `db.snapshot.json` tipado como ConfigDB.
//   - loadGolden():  el golden `expected-kpis.json` tipado (Golden).
//   - GOLDEN_TODAY:  la fecha constante `meta.today` del golden (NO hardcodeada;
//                    se lee del propio archivo). Se reutiliza como ctx.today.
//   - makeCtx():     construye un ComputeContext para (pais, dashYear) con
//                    today=GOLDEN_TODAY, dep="__all__", area="__all__".
//
// Los fixtures se leen con fs + JSON.parse (en vez de `import ... json`) para no
// inflar los tipos de TS con el literal gigante del JSON y para mantener el
// control del tipado explícito. Las rutas se resuelven relativas a este archivo
// vía fileURLToPath(import.meta.url), de modo que funcionan sin depender del cwd.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ComputeContext, ConfigDB } from "../../core/types";

// ---------------------------------------------------------------------------
// Rutas a los fixtures (relativas a este archivo: test/parity → test/fixtures)
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures");
const DB_SNAPSHOT_PATH = join(FIXTURES_DIR, "db.snapshot.json");
const GOLDEN_PATH = join(FIXTURES_DIR, "expected-kpis.json");

// ---------------------------------------------------------------------------
// Tipos del golden (expected-kpis.json)
// ---------------------------------------------------------------------------

/** Par [numerador, denominador] tal como lo produce compute().raw. */
export type RawPair = [number, number];

/**
 * Celda (mes, país) del golden: los valores que el sistema actual produjo para
 * esa combinación. `ind`/`raw`/`acc` se vuelcan tal cual (null es significativo).
 */
export interface GoldenCell {
  /** compute(mes).ind — valor mensual (snapshot) por clave de indicador. */
  ind: Record<string, number | null>;
  /** compute(mes).raw — pares [num, den] por KPI acumulable. */
  raw: Record<string, RawPair>;
  /** accValue(kpi, mes) — valor acumulado (YTD) por clave de indicador. */
  acc: Record<string, number | null>;
  hcTot: number;
  prom: number;
  edadProm: number;
  antigProm: number;
  diasSinAcc: number | null;
}

/** Metadatos del golden (meta.*). */
export interface GoldenMeta {
  today: string;
  generatedFrom: string;
  generator: string;
  kpiKeys: string[];
  kpiCount: number;
  indKeys: string[];
  indCount: number;
  rawKeys: string[];
  paises: string[];
  months: string[];
  note?: string;
}

/** Estructura completa de expected-kpis.json. */
export interface Golden {
  meta: GoldenMeta;
  /** byMonthPais[mes][pais] = GoldenCell. */
  byMonthPais: Record<string, Record<string, GoldenCell>>;
}

// ---------------------------------------------------------------------------
// Carga perezosa + cacheada (los fixtures son de solo lectura)
// ---------------------------------------------------------------------------
let _db: ConfigDB | null = null;
let _golden: Golden | null = null;

/** Carga `db.snapshot.json` como ConfigDB (objeto { key: value } = DB). */
export function loadDB(): ConfigDB {
  if (_db === null) {
    _db = JSON.parse(readFileSync(DB_SNAPSHOT_PATH, "utf8")) as ConfigDB;
  }
  return _db;
}

/** Carga `expected-kpis.json` tipado como Golden. */
export function loadGolden(): Golden {
  if (_golden === null) {
    _golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;
  }
  return _golden;
}

// ---------------------------------------------------------------------------
// Fecha de referencia constante (meta.today del golden) — NO hardcodear
// ---------------------------------------------------------------------------

/**
 * Fecha constante usada al generar el golden (`meta.today`). Se lee del propio
 * archivo para que, si el golden se regenera con otra fecha, los tests sigan
 * fijando `ctx.today` a la fecha correcta sin tocar código.
 */
export const GOLDEN_TODAY: Date = new Date(loadGolden().meta.today);

// ---------------------------------------------------------------------------
// Construcción del ComputeContext para paridad
// ---------------------------------------------------------------------------

/**
 * Construye un `ComputeContext` para (pais, dashYear) con:
 *   today = GOLDEN_TODAY, dep = "__all__", area = "__all__".
 *
 * @param pais     "__all__" | "Costa Rica" | "Venezuela" (scope de país).
 * @param dashYear Año del dashboard (reemplaza +CUR.slice(0,4)).
 */
export function makeCtx(pais: string, dashYear: number): ComputeContext {
  return {
    pais,
    dep: "__all__",
    area: "__all__",
    today: GOLDEN_TODAY,
    dashYear,
  };
}

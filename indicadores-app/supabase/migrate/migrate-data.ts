// =============================================================================
// supabase/migrate/migrate-data.ts
//
// Script de migración kv → normalizado.
//
// El snapshot original vive como pares clave/valor en la tabla
// `olo_indicadores_kv`: una clave `__cfg` con la configuración global y una
// clave `YYYY-MM` por mes con todas las entidades y parámetros. Este script
// descompone ese kv en el esquema normalizado (`ind_*`).
//
// Se construye en dos tareas:
//   - 8.2 (ESTA): migración de la Config_Global (`__cfg`).
//   - 8.3: migración de meses, países, entidades y parámetros.
//
// ⚠️ SOLO SERVIDOR. Usa el cliente `service_role` (omite RLS). Nunca debe
//    importarse en código de cliente.
//
// Fuente de datos (elegible por entorno/argumento):
//   - fixture local `test/fixtures/db.snapshot.json`  (por defecto, sin tocar la base)
//   - Supabase (tabla `olo_indicadores_kv`)           (--source=supabase)
//
// Modo dry-run (`--dry-run`): NO escribe en Supabase; solo reporta los conteos
// de lo que insertaría. Útil para validar la lógica sin tocar la base.
//
// Cómo correrlo (Windows / PowerShell, Node 24):
//
//   # Dry-run con el fixture local (por defecto). No escribe nada.
//   npx tsx supabase/migrate/migrate-data.ts --dry-run
//
//   # Dry-run forzando la fuente fixture explícitamente.
//   npx tsx supabase/migrate/migrate-data.ts --source=fixture --dry-run
//
//   # Migración real desde el fixture hacia Supabase (requiere env vars).
//   npx tsx supabase/migrate/migrate-data.ts --source=fixture
//
//   # Migración real leyendo el snapshot desde Supabase (tabla kv).
//   npx tsx supabase/migrate/migrate-data.ts --source=supabase
//
// También se puede controlar por variables de entorno:
//   MIGRATE_SOURCE=fixture|supabase   (equivale a --source=...)
//   MIGRATE_DRY_RUN=1                 (equivale a --dry-run)
//
// _Requirements: 15.3_
// =============================================================================

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConfigGlobal, ParametrosMes } from "../../core/types";
import type {
  IndConfigKvInsert,
  IndConfigLeadersInsert,
  IndConfigMetasInsert,
  IndConfigKpiOffInsert,
  IndConfigSatisfaccionInsert,
  IndColaboradorInsert,
  IndEgresoInsert,
  IndAusenciaInsert,
  IndVacacionInsert,
  IndExtraInsert,
  IndCapacitacionInsert,
  IndMermaInsert,
  IndTerceroInsert,
  IndAreaInsert,
  IndParametrosMesInsert,
  IndMesInsert,
  IndPaisInsert,
} from "../types";
import { createAdminClient } from "../../lib/supabase/admin";
import { limpiarMesesVacios, type RawDB } from "./clean";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Ruta por defecto del fixture local del snapshot kv. */
const FIXTURE_PATH = resolve(__dirname, "../../test/fixtures/db.snapshot.json");

// ===========================================================================
// Abstracción de escritura: permite el mismo código para real y dry-run.
// ===========================================================================

/**
 * Un "sink" de escritura. En modo real delega en el cliente Supabase; en modo
 * dry-run solo contabiliza las filas que se insertarían, sin tocar la base.
 */
export interface MigrationSink {
  /** Upsert de filas en una tabla con la columna/PK indicada en `onConflict`. */
  upsert(
    table: string,
    rows: Record<string, unknown>[],
    onConflict: string,
  ): Promise<void>;
  /** Insert de filas en una tabla. */
  insert(table: string, rows: Record<string, unknown>[]): Promise<void>;
  /**
   * Borra todas las filas de `table` cuyo `mes` esté en `meses`. Base de la
   * estrategia de idempotencia: antes de insertar las filas de un mes se borran
   * las existentes de ese mes (las tablas de datos usan `id` identity, así que
   * un insert directo duplicaría). En dry-run es un no-op (no toca la base).
   */
  deleteByMonth(table: string, meses: string[]): Promise<void>;
  /** Conteos acumulados por tabla (filas escritas/contadas). */
  readonly counts: Record<string, number>;
}

/** Sink real: escribe en Supabase vía el cliente `service_role`. */
export class SupabaseSink implements MigrationSink {
  readonly counts: Record<string, number> = {};
  private readonly sb: SupabaseClient;

  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }

  private bump(table: string, n: number): void {
    this.counts[table] = (this.counts[table] ?? 0) + n;
  }

  async upsert(
    table: string,
    rows: Record<string, unknown>[],
    onConflict: string,
  ): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.sb.from(table).upsert(rows, { onConflict });
    if (error) {
      throw new Error(`upsert ${table} falló: ${error.message}`);
    }
    this.bump(table, rows.length);
  }

  async insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.sb.from(table).insert(rows);
    if (error) {
      throw new Error(`insert ${table} falló: ${error.message}`);
    }
    this.bump(table, rows.length);
  }

  async deleteByMonth(table: string, meses: string[]): Promise<void> {
    if (meses.length === 0) return;
    const { error } = await this.sb.from(table).delete().in("mes", meses);
    if (error) {
      throw new Error(`delete ${table} (por mes) falló: ${error.message}`);
    }
  }
}

/** Sink dry-run: no escribe; solo contabiliza. */
export class DryRunSink implements MigrationSink {
  readonly counts: Record<string, number> = {};

  private bump(table: string, n: number): void {
    this.counts[table] = (this.counts[table] ?? 0) + n;
  }

  async upsert(
    table: string,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    this.bump(table, rows.length);
  }

  async insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    this.bump(table, rows.length);
  }

  async deleteByMonth(): Promise<void> {
    // dry-run: no borra nada.
  }
}

// ===========================================================================
// 8.2 — Migración de la Config_Global (`__cfg`)
// ===========================================================================

/**
 * Claves de `__cfg` que ya tienen su propia tabla normalizada. Cualquier otro
 * escalar de `__cfg` (p. ej. `sysUrl`) se vuelca como kv genérico.
 */
const CFG_STRUCTURED_KEYS = new Set([
  "metas",
  "leaders",
  "kpiOff",
  "satisfaccion",
]);

/**
 * Descompone `__cfg` (Config_Global) en las tablas normalizadas de config y
 * lo escribe a través del `sink` (real o dry-run). Idempotente: usa upsert con
 * `onConflict` en la PK de cada tabla de config.
 *
 * Reparto:
 *  - `metas`        → `ind_config_metas`         { kpi, a, b }  (omite valores null)
 *  - `leaders`      → `ind_config_leaders`       { area, lider, correo }
 *  - `kpiOff`       → `ind_config_kpi_off`       { kpi }
 *  - `satisfaccion` → `ind_config_satisfaccion`  { anio, valor }
 *  - `sysUrl` (y otros escalares sueltos de __cfg) → `ind_config_kv` { key, value }
 *
 * @param cfg  La Config_Global cruda (`__cfg`).
 * @param sink Destino de escritura (SupabaseSink o DryRunSink).
 */
export async function migrateConfig(
  cfg: ConfigGlobal,
  sink: MigrationSink,
): Promise<void> {
  // --- metas → ind_config_metas (una fila por KPI con [a,b] no nulo) --------
  const metasRows: IndConfigMetasInsert[] = [];
  for (const [kpi, pair] of Object.entries(cfg.metas ?? {})) {
    if (!Array.isArray(pair)) continue; // null u otro → se omite
    const [a, b] = pair;
    metasRows.push({ kpi, a, b });
  }
  await sink.upsert("ind_config_metas", metasRows, "kpi");

  // --- leaders → ind_config_leaders (clave area) ----------------------------
  const leaderRows: IndConfigLeadersInsert[] = (cfg.leaders ?? []).map((l) => ({
    area: l.area,
    lider: l.lider,
    correo: l.correo,
  }));
  await sink.upsert("ind_config_leaders", leaderRows, "area");

  // --- kpiOff → ind_config_kpi_off (una fila por clave) ---------------------
  const kpiOffRows: IndConfigKpiOffInsert[] = (cfg.kpiOff ?? []).map((kpi) => ({
    kpi,
  }));
  // Idempotente: la tabla solo tiene PK `kpi`; upsert evita duplicados.
  await sink.upsert("ind_config_kpi_off", kpiOffRows, "kpi");

  // --- satisfaccion → ind_config_satisfaccion (por año) ---------------------
  const satRows: IndConfigSatisfaccionInsert[] = Object.entries(
    cfg.satisfaccion ?? {},
  ).map(([anio, valor]) => ({ anio: +anio, valor }));
  await sink.upsert("ind_config_satisfaccion", satRows, "anio");

  // --- kv → ind_config_kv (sysUrl + cualquier escalar suelto de __cfg) ------
  const kvRows: IndConfigKvInsert[] = [];
  kvRows.push({ key: "sysUrl", value: cfg.sysUrl ?? "" });
  // Cualquier otro escalar de __cfg que NO tenga tabla propia se guarda como kv
  // genérico (string/number/boolean). Objetos y arrays desconocidos se omiten.
  for (const [key, val] of Object.entries(cfg as unknown as Record<string, unknown>)) {
    if (key === "sysUrl" || CFG_STRUCTURED_KEYS.has(key)) continue;
    if (val === null || val === undefined) continue;
    if (typeof val === "object") continue; // estructuras desconocidas: se omiten
    kvRows.push({ key, value: String(val) });
  }
  await sink.upsert("ind_config_kv", kvRows, "key");
}

// ===========================================================================
// 8.3 — Migración de meses, países, entidades y parámetros
// ===========================================================================
//
// Decisiones de modelado (documentadas en el reporte de la tarea):
//
//  1. CÉDULAS VACÍAS (PK de ind_colaboradores = (cedula, mes, pais)).
//     En el snapshot kv casi todos los `activos` traen `id: ""`. Como la PK es
//     (cedula, mes, pais), insertar 182 activos con cedula "" en el mismo
//     mes/país colapsaría a UNA sola fila (o reventaría la PK). Para NO perder
//     registros, cuando la cédula viene vacía se genera una cédula SINTÉTICA y
//     estable por fila: `__row_<índice>` (índice dentro del array de activos de
//     ese mes). Es estable entre corridas (mismo snapshot ⇒ misma cédula) y
//     única dentro del par (mes, país). Las cédulas reales se preservan tal
//     cual. El motor compute() nunca usa la cédula como dato numérico, así que
//     esto no altera ningún KPI; solo garantiza unicidad de la PK.
//
//  2. PARÁMETROS POR PAÍS (PK de ind_parametros_mes = (mes, pais)).
//     En el snapshot `params` es ÚNICO por mes (no por país). El modelo
//     normalizado lo indexa por (mes, país). Decisión: se REPLICA el MISMO
//     `params` para cada país presente en el mes (una fila por país con idéntico
//     JSONB). Así la lectura por (mes, país) siempre encuentra los parámetros,
//     cualquiera sea el país consultado, manteniendo paridad con el sistema
//     actual (que lee params por mes). Si un mes no tiene ningún país en sus
//     entidades pero sí params con datos, se usa un país por defecto del dominio
//     (`FALLBACK_PAIS`) para no perder los parámetros.
//
//  3. IDEMPOTENCIA. Las tablas de datos usan `id` identity, por lo que un
//     segundo insert duplicaría filas. Antes de insertar cada mes se BORRAN sus
//     filas existentes (DELETE WHERE mes IN (...)) en todas las tablas de datos
//     y de colaboradores/parámetros. Catálogos (ind_paises, ind_meses) y
//     ind_parametros_mes usan upsert on conflict. En dry-run el DELETE es no-op.

/** País por defecto cuando un mes tiene params pero ningún país en sus datos. */
const FALLBACK_PAIS = "Costa Rica";

/** Tablas de datos que se borran por mes para garantizar idempotencia. */
const DATA_TABLES = [
  "ind_colaboradores",
  "ind_egresos",
  "ind_ausencias",
  "ind_vacaciones",
  "ind_extras",
  "ind_capacitacion",
  "ind_merma",
  "ind_terceros",
  "ind_areas",
  "ind_parametros_mes",
] as const;

/** Patrón `YYYY-MM`. */
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Coacciona a número al estilo del motor (`+x || 0`). Vacío/NaN → 0. */
function toNum(x: unknown): number {
  const n = +(x as number);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza una fecha a `YYYY-MM-DD` para columnas `date`. Devuelve `null` si
 * está vacía o no es una fecha válida (evita que Postgres rechace el insert).
 */
function toDate(x: unknown): string | null {
  if (x == null) return null;
  const s = String(x).trim();
  if (s === "") return null;
  // Formato ISO directo (lo más común en el snapshot).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    const yy = +y, mm = +mo, dd = +d;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${y}-${mo}-${d}`;
  }
  // Último recurso: dejar que Date lo parsee; si falla, null.
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/** Convierte "" / null / undefined a null; cualquier otro valor a string. */
function strOrNull(x: unknown): string | null {
  if (x == null) return null;
  const s = String(x);
  return s === "" ? null : s;
}

/** Determina si un año `YYYY` está dentro del rango “razonable” [2024, hoy+1]. */
function isBogusYear(mes: string, now = new Date()): boolean {
  const year = +mes.slice(0, 4);
  const max = now.getFullYear() + 1;
  return year < 2024 || year > max;
}

/**
 * Deriva el conjunto de países presentes en un mes (campo `.pais` no vacío de
 * cualquier entidad). Si no hay ninguno, devuelve `[FALLBACK_PAIS]` para no
 * perder los parámetros del mes.
 */
function paisesDelMes(month: Record<string, unknown>): string[] {
  const set = new Set<string>();
  const ENTS = [
    "activos",
    "egresos",
    "ausencias",
    "vacaciones",
    "extras",
    "capacitacion",
    "merma",
    "terceros",
  ];
  for (const e of ENTS) {
    const arr = month[e];
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      const p = (r as Record<string, unknown>)?.pais;
      if (typeof p === "string" && p.trim() !== "") set.add(p);
    }
  }
  if (set.size === 0) set.add(FALLBACK_PAIS);
  return [...set];
}

/** Devuelve el país de un registro, con fallback al país por defecto. */
function paisDe(r: Record<string, unknown>): string {
  const p = r.pais;
  return typeof p === "string" && p.trim() !== "" ? p : FALLBACK_PAIS;
}

/**
 * Migra meses, países, entidades y parámetros desde el snapshot kv limpio hacia
 * el esquema normalizado, a través del `sink` (real o dry-run).
 *
 * @param db    Snapshot ya limpio (salida de `limpiarMesesVacios`, incluye `__cfg`).
 * @param kept  Claves `YYYY-MM` conservadas a migrar.
 * @param sink  Destino de escritura.
 */
export async function migrateEntities(
  db: RawDB,
  kept: string[],
  sink: MigrationSink,
): Promise<void> {
  // Orden determinista: facilita la lectura del reporte y la idempotencia.
  const meses = [...kept].filter((k) => MONTH_RE.test(k)).sort();

  // --- 1) Países: el conjunto realmente presente en los datos conservados. --
  const paisSet = new Set<string>();
  for (const k of meses) {
    for (const p of paisesDelMes(db[k] as Record<string, unknown>)) {
      paisSet.add(p);
    }
  }
  const paisRows: IndPaisInsert[] = [...paisSet]
    .sort()
    .map((nombre) => ({ nombre }));
  await sink.upsert("ind_paises", paisRows, "nombre");

  // --- 2) Meses: una fila por clave conservada. -----------------------------
  const mesRows: IndMesInsert[] = meses.map((mes) => ({ mes }));
  await sink.upsert("ind_meses", mesRows, "mes");

  // --- 3) Idempotencia: borrar las filas previas de estos meses. ------------
  for (const table of DATA_TABLES) {
    await sink.deleteByMonth(table, meses);
  }

  // --- 4) Entidades + parámetros, mes por mes. ------------------------------
  for (const mes of meses) {
    const month = (db[mes] ?? {}) as Record<string, unknown>;

    // --- Colaboradores (de `activos`) -------------------------------------
    const activos = Array.isArray(month.activos) ? month.activos : [];
    const colabRows: IndColaboradorInsert[] = activos.map((r, i) => {
      const rec = r as Record<string, unknown>;
      const rawCedula = typeof rec.id === "string" ? rec.id.trim() : "";
      // Cédula sintética estable si viene vacía (ver decisión #1).
      const cedula = rawCedula !== "" ? rawCedula : `__row_${i}`;
      return {
        cedula,
        mes,
        pais: paisDe(rec),
        nombre: strOrNull(rec.nombre),
        departamento: strOrNull(rec.departamento),
        area: strOrNull(rec.area),
        sexo: strOrNull(rec.sexo),
        fecha_nacimiento: toDate(rec.fecha_nacimiento),
        fecha_ingreso: toDate(rec.fecha_ingreso),
        nivel: strOrNull(rec.nivel),
        nivel_educativo: strOrNull(rec.nivel_educativo),
        carrera: strOrNull(rec.carrera),
        movilidad: strOrNull(rec.movilidad),
        movimiento: strOrNull(rec.movimiento),
        tipo: strOrNull(rec.tipo),
        paso: strOrNull(rec.paso),
        vac_disfrutadas: toNum(rec.vac_disfrutadas),
        vac_pendientes: toNum(rec.vac_pendientes),
      };
    });
    await sink.insert("ind_colaboradores", colabRows);

    // --- Egresos ----------------------------------------------------------
    const egresos = Array.isArray(month.egresos) ? month.egresos : [];
    const egresoRows: IndEgresoInsert[] = egresos.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        cedula: strOrNull(rec.id),
        mes,
        pais: paisDe(rec),
        nombre: strOrNull(rec.nombre),
        departamento: strOrNull(rec.departamento),
        motivo: strOrNull(rec.motivo),
        fecha_ingreso: toDate(rec.fecha_ingreso),
        fecha_salida: toDate(rec.fecha_salida),
        movilidad: strOrNull(rec.movilidad),
        recomienda: strOrNull(rec.recomienda),
      };
    });
    await sink.insert("ind_egresos", egresoRows);

    // --- Ausencias --------------------------------------------------------
    const ausencias = Array.isArray(month.ausencias) ? month.ausencias : [];
    const ausenciaRows: IndAusenciaInsert[] = ausencias.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        cedula: strOrNull(rec.id),
        mes,
        pais: paisDe(rec),
        nombre: strOrNull(rec.nombre),
        departamento: strOrNull(rec.departamento),
        tipo: strOrNull(rec.tipo),
        dias: toNum(rec.dias),
      };
    });
    await sink.insert("ind_ausencias", ausenciaRows);

    // --- Vacaciones -------------------------------------------------------
    const vacaciones = Array.isArray(month.vacaciones) ? month.vacaciones : [];
    const vacacionRows: IndVacacionInsert[] = vacaciones.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        cedula: strOrNull(rec.id),
        mes,
        pais: paisDe(rec),
        nombre: strOrNull(rec.nombre),
        departamento: strOrNull(rec.departamento),
        area: strOrNull(rec.area),
        dias: toNum(rec.dias),
      };
    });
    await sink.insert("ind_vacaciones", vacacionRows);

    // --- Extras -----------------------------------------------------------
    const extras = Array.isArray(month.extras) ? month.extras : [];
    const extraRows: IndExtraInsert[] = extras.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        cedula: strOrNull(rec.id),
        mes,
        pais: paisDe(rec),
        nombre: strOrNull(rec.nombre),
        departamento: strOrNull(rec.departamento),
        area: strOrNull(rec.area),
        horas: toNum(rec.horas),
      };
    });
    await sink.insert("ind_extras", extraRows);

    // --- Capacitación (sin cédula; participantes puede venir como texto) --
    const capacitacion = Array.isArray(month.capacitacion)
      ? month.capacitacion
      : [];
    const capRows: IndCapacitacionInsert[] = capacitacion.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        mes,
        pais: paisDe(rec),
        area_conocimiento: strOrNull(rec.area_conocimiento),
        curso: strOrNull(rec.curso),
        horas: toNum(rec.horas),
        participantes: toNum(rec.participantes),
      };
    });
    await sink.insert("ind_capacitacion", capRows);

    // --- Merma (sin cédula) -----------------------------------------------
    const merma = Array.isArray(month.merma) ? month.merma : [];
    const mermaRows: IndMermaInsert[] = merma.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        mes,
        pais: paisDe(rec),
        area: strOrNull(rec.area),
        cantidad: toNum(rec.cantidad),
      };
    });
    await sink.insert("ind_merma", mermaRows);

    // --- Terceros (sin cédula) --------------------------------------------
    const terceros = Array.isArray(month.terceros) ? month.terceros : [];
    const tercRows: IndTerceroInsert[] = terceros.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        mes,
        pais: paisDe(rec),
        cantidad: toNum(rec.cantidad),
      };
    });
    await sink.insert("ind_terceros", tercRows);

    // --- Áreas (sin país, sin cédula) -------------------------------------
    const areas = Array.isArray(month.areas) ? month.areas : [];
    const areaRows: IndAreaInsert[] = areas.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        mes,
        grupo: strOrNull(rec.grupo),
        area: strOrNull(rec.area),
        colaboradores: toNum(rec.colaboradores),
      };
    });
    await sink.insert("ind_areas", areaRows);

    // --- Parámetros: una fila por país presente, con el MISMO params ------
    const params = (month.params ?? {}) as ParametrosMes;
    const paisesMes = paisesDelMes(month);
    const paramRows: IndParametrosMesInsert[] = paisesMes.map((pais) => ({
      mes,
      pais,
      params,
    }));
    await sink.upsert("ind_parametros_mes", paramRows, "mes,pais");
  }
}

// ===========================================================================
// Carga del snapshot kv (fixture local o Supabase)
// ===========================================================================

export type MigrateSource = "fixture" | "supabase";

/** Lee el snapshot kv desde el fixture local (`db.snapshot.json`). */
async function loadSnapshotFromFixture(path = FIXTURE_PATH): Promise<RawDB> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as RawDB;
}

/**
 * Lee el snapshot kv desde Supabase (tabla `olo_indicadores_kv`, columnas
 * `key` y `value`) y lo reconstruye como `{ [key]: value }`.
 */
async function loadSnapshotFromSupabase(sb: SupabaseClient): Promise<RawDB> {
  const { data, error } = await sb
    .from("olo_indicadores_kv")
    .select("key, value");
  if (error) {
    throw new Error(`No se pudo leer olo_indicadores_kv: ${error.message}`);
  }
  const db: RawDB = {};
  for (const row of data ?? []) {
    const { key, value } = row as { key: string; value: unknown };
    db[key] = value;
  }
  return db;
}

/** Extrae `__cfg` del snapshot con un fallback vacío y bien tipado. */
function extractCfg(db: RawDB): ConfigGlobal {
  const cfg = (db.__cfg ?? {}) as Partial<ConfigGlobal>;
  return {
    metas: cfg.metas ?? {},
    leaders: cfg.leaders ?? [],
    sysUrl: cfg.sysUrl ?? "",
    kpiOff: cfg.kpiOff ?? [],
    satisfaccion: cfg.satisfaccion ?? {},
  };
}

// ===========================================================================
// CLI runner
// ===========================================================================

interface CliOptions {
  source: MigrateSource;
  dryRun: boolean;
  /**
   * Utilidad OPCIONAL: excluir meses con año fuera de [2024, añoActual+1].
   * Por DEFECTO es `false` (se migra TODO lo que conserva `limpiarMesesVacios`,
   * fiel al sistema actual). Solo filtra si se pasa `--drop-bogus-years`.
   */
  dropBogusYears: boolean;
}

/** Parsea argumentos de CLI y variables de entorno en opciones. */
export function parseArgs(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  let source: MigrateSource =
    env.MIGRATE_SOURCE === "supabase" ? "supabase" : "fixture";
  let dryRun = env.MIGRATE_DRY_RUN === "1" || env.MIGRATE_DRY_RUN === "true";
  let dropBogusYears =
    env.MIGRATE_DROP_BOGUS_YEARS === "1" ||
    env.MIGRATE_DROP_BOGUS_YEARS === "true";

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--source=supabase") source = "supabase";
    else if (arg === "--source=fixture") source = "fixture";
    else if (arg === "--drop-bogus-years") dropBogusYears = true;
  }
  return { source, dryRun, dropBogusYears };
}

/** Imprime los conteos por tabla de forma legible. */
function reportCounts(label: string, counts: Record<string, number>): void {
  console.log(`\n=== ${label} ===`);
  const tables = Object.keys(counts).sort();
  if (tables.length === 0) {
    console.log("  (sin filas)");
    return;
  }
  for (const t of tables) {
    console.log(`  ${t}: ${counts[t]}`);
  }
}

/**
 * Punto de entrada del script.
 *
 * Flujo:
 *  1. Elige la fuente (fixture local o Supabase kv).
 *  2. Limpia los meses basura con `limpiarMesesVacios` (8.1).
 *  3. Migra la Config_Global (`__cfg`) → tablas de config (8.2).
 *  4. TODO(8.3): migrar meses, países, entidades y parámetros.
 *
 * En `--dry-run` no se escribe en Supabase; se reportan conteos.
 */
export async function main(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { source, dryRun, dropBogusYears } = parseArgs(argv, env);
  console.log(
    `migrate-data: source=${source} dry-run=${dryRun ? "sí" : "no"}` +
      (dropBogusYears ? " drop-bogus-years=sí" : ""),
  );

  // En dry-run con fixture NO necesitamos cliente admin (ni env vars).
  const needsClient = source === "supabase" || !dryRun;
  const sb = needsClient ? createAdminClient() : null;

  // 1) Cargar snapshot kv.
  const rawDb =
    source === "supabase"
      ? await loadSnapshotFromSupabase(sb!)
      : await loadSnapshotFromFixture();

  // 2) Descartar meses basura (8.1). No afecta a `__cfg` (siempre se conserva).
  const { kept, removed, db } = limpiarMesesVacios(rawDb);
  console.log(
    `limpiarMesesVacios: ${kept.length} meses conservados, ${removed.length} descartados`,
  );

  // 3) Config_Global (8.2).
  const cfg = extractCfg(db);
  const sink: MigrationSink =
    dryRun || !sb ? new DryRunSink() : new SupabaseSink(sb);
  await migrateConfig(cfg, sink);

  reportCounts(dryRun ? "CONFIG (dry-run, filas que se insertarían)" : "CONFIG (filas escritas)", sink.counts);

  // 4) Entidades, países, meses y parámetros (8.3).
  //    Por defecto se migra TODO lo que conservó `limpiarMesesVacios`. La
  //    utilidad opcional `--drop-bogus-years` descarta años fuera de rango.
  let mesesAMigrar = kept;
  if (dropBogusYears) {
    const before = mesesAMigrar.length;
    mesesAMigrar = mesesAMigrar.filter((k) => !isBogusYear(k));
    console.log(
      `--drop-bogus-years: ${before - mesesAMigrar.length} meses con año fuera de [2024, actual+1] excluidos`,
    );
  }

  // El sink de entidades acumula sus propios conteos; usamos uno nuevo para que
  // el reporte de ENTIDADES no mezcle los conteos de CONFIG.
  const entitySink: MigrationSink =
    dryRun || !sb ? new DryRunSink() : new SupabaseSink(sb);
  await migrateEntities(db, mesesAMigrar, entitySink);

  reportCounts(
    dryRun
      ? "ENTIDADES (dry-run, filas que se insertarían)"
      : "ENTIDADES (filas escritas)",
    entitySink.counts,
  );
}

// Ejecuta `main()` solo si el módulo se corre directamente (no al importarlo).
const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

// =============================================================================
// lib/data/queries.ts
//
// Capa de LECTURA (server-side): lee las tablas normalizadas `ind_*` con el
// cliente Supabase del SERVIDOR (sesión del usuario vía cookies) y las pasa a
// la capa de ensamblaje (`assemble.ts`) para reconstruir el `ConfigDB`/`MesData`
// que el motor (`core/compute.ts`) consume.
//
// RLS (Req 13.1): TODAS las queries usan el server client (`lib/supabase/server`),
// que reenvía la sesión del usuario. Supabase ejecuta las lecturas con el JWT del
// usuario, así que el aislamiento por país lo aplica la base automáticamente:
//   - scope 'pais'   → solo recibe filas de su país.
//   - scope 'global' → recibe todos los países.
//   - scope 'admin'  → no recibe data (solo gestiona usuarios).
// NUNCA se usa el admin client (service_role) aquí: eso saltearía RLS.
//
// -----------------------------------------------------------------------------
// DECISIÓN — RANGO DE MESES (desercion12 + acumulados)
// -----------------------------------------------------------------------------
// El motor, para calcular un año del dashboard, no solo necesita los 12 meses
// del año pedido sino también meses PREVIOS de arrastre:
//
//   * `desercion12(k)` usa una ventana de 12 meses hacia atrás:
//        start = new Date(y, mo-12, 1),  end = new Date(y, mo, 0)
//     Para el PRIMER mes del año (enero, mo=1), la ventana arranca en
//     `new Date(y, -11, 1)` = `${y-1}-02-01`. Además `desercion12` recorre
//     TODOS los meses del `db` sumando egresos cuya `fecha_salida` cae en la
//     ventana, por lo que necesita las filas de los meses del año anterior
//     presentes en el `db`.
//   * `accValue` acumula de enero..mes del año pedido (meses del propio año).
//
// Para cubrir ambos con el mínimo de datos y de forma segura, `loadDB(year)`
// trae el rango de meses **[`${year-1}-01` .. `${year}-12`]** (24 claves de
// mes). Eso garantiza:
//   - los 12 meses del año pedido (acumulados), y
//   - los 12 meses del año anterior (arrastre completo para la ventana de
//     `desercion12` de CUALQUIER mes del año, incluido enero).
// Filtramos por `mes` con `.gte()`/`.lte()` sobre el string "YYYY-MM" (orden
// lexicográfico == cronológico para este formato), lo que reduce el volumen
// frente a "traer todo" sin perder correctitud. Las tablas de config no llevan
// `mes` y se leen completas.
//
// -----------------------------------------------------------------------------
// PAGINACIÓN
// -----------------------------------------------------------------------------
// supabase-js limita a 1000 filas por request por defecto. `ind_colaboradores`
// puede crecer a varios miles al acumular meses. Para no perder filas,
// `fetchAll()` pagina con `.range(from, to)` en bucle hasta que una página
// vuelve con menos de PAGE_SIZE filas (o vacía). Todas las entidades con `mes`
// y las de config se leen con este helper.
//
// _Requirements: 13.1, 17.1_
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConfigDB, ConfigGlobal, MonthKey } from "../../core/types";
import type { Database } from "../../supabase/types";
import type {
  IndAreaRow,
  IndAusenciaRow,
  IndCapacitacionRow,
  IndColaboradorRow,
  IndConfigKvRow,
  IndConfigKpiOffRow,
  IndConfigLeadersRow,
  IndConfigMetasRow,
  IndConfigSatisfaccionRow,
  IndEgresoRow,
  IndExtraRow,
  IndMermaRow,
  IndParametrosMesRow,
  IndTerceroRow,
  IndVacacionRow,
} from "../../supabase/types";
import { createClient } from "../supabase/server";
import {
  assembleConfig,
  assembleDB,
  assembleMesData,
  type AssembleConfigInput,
  type AssembleDBInput,
} from "./assemble";

/** Cliente server tipado con el esquema `Database` (respeta RLS). */
export type ServerClient = SupabaseClient<Database>;

/** Tamaño de página para la paginación con `.range()` (límite de supabase-js). */
const PAGE_SIZE = 1000;

// ===========================================================================
// Helpers de rango de meses
// ===========================================================================

/**
 * Rango de meses [desde, hasta] (ambos inclusive, formato "YYYY-MM") que
 * `loadDB(year)` necesita: desde `${year-1}-01` hasta `${year}-12`.
 * Ver "DECISIÓN — RANGO DE MESES" arriba.
 */
export function mesRangeForYear(year: number): { from: string; to: string } {
  return { from: `${year - 1}-01`, to: `${year}-12` };
}

// ===========================================================================
// fetchAll — paginación con .range()
// ===========================================================================

/**
 * Builder mínimo de supabase-js que soporta `.range()` y es `await`-able a
 * `{ data, error }`. Se tipa de forma laxa porque el tipo real del builder es
 * complejo y específico de la versión; aquí solo usamos `range()`.
 */
interface RangeableBuilder<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

/**
 * Trae TODAS las filas de una query paginando con `.range()` hasta agotar los
 * resultados. `makeQuery` debe devolver un builder NUEVO en cada llamada (cada
 * página es un request independiente con su propio `.range()`), preservando los
 * filtros (p.ej. el rango de meses). Lanza si la base devuelve un error.
 *
 * @param label   Nombre de la tabla/consulta (para mensajes de error claros).
 * @param makeQuery Fábrica que arma la query base (select + filtros) sin rango.
 */
async function fetchAll<T>(
  label: string,
  makeQuery: () => RangeableBuilder<T>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Bucle de paginación: pedimos páginas de PAGE_SIZE hasta que una vuelve
  // incompleta (menos de PAGE_SIZE) o vacía.
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) {
      throw new Error(`Error leyendo ${label}: ${error.message}`);
    }
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

// ===========================================================================
// loadConfig
// ===========================================================================

/**
 * Lee las tablas de config global (`ind_config_*`) y arma `ConfigGlobal`
 * (`__cfg`) con `assembleConfig`. Las tablas de config no llevan `mes` ni
 * `pais`: describen el estado global del sistema.
 *
 * @param sb Cliente server opcional. Si no se pasa, se crea con `createClient()`
 *           (respeta RLS con la sesión del usuario).
 */
export async function loadConfig(sb?: ServerClient): Promise<ConfigGlobal> {
  const client = sb ?? ((await createClient()) as ServerClient);

  const [metas, leaders, kpiOff, satisfaccion, kv] = await Promise.all([
    fetchAll<IndConfigMetasRow>("ind_config_metas", () =>
      client.from("ind_config_metas").select("*") as unknown as RangeableBuilder<IndConfigMetasRow>,
    ),
    fetchAll<IndConfigLeadersRow>("ind_config_leaders", () =>
      client.from("ind_config_leaders").select("*") as unknown as RangeableBuilder<IndConfigLeadersRow>,
    ),
    fetchAll<IndConfigKpiOffRow>("ind_config_kpi_off", () =>
      client.from("ind_config_kpi_off").select("*") as unknown as RangeableBuilder<IndConfigKpiOffRow>,
    ),
    fetchAll<IndConfigSatisfaccionRow>("ind_config_satisfaccion", () =>
      client
        .from("ind_config_satisfaccion")
        .select("*") as unknown as RangeableBuilder<IndConfigSatisfaccionRow>,
    ),
    fetchAll<IndConfigKvRow>("ind_config_kv", () =>
      client.from("ind_config_kv").select("*") as unknown as RangeableBuilder<IndConfigKvRow>,
    ),
  ]);

  const input: AssembleConfigInput = { metas, leaders, kpiOff, satisfaccion, kv };
  return assembleConfig(input);
}

// ===========================================================================
// loadDB
// ===========================================================================

/**
 * Lee todas las entidades de datos para el rango de meses que el motor necesita
 * para calcular el año `year` (ver "DECISIÓN — RANGO DE MESES"), más la config,
 * y devuelve el `ConfigDB` ensamblado con `assembleDB`.
 *
 * RLS filtra el país automáticamente (el usuario de país solo recibe su país;
 * global recibe todo). `ind_areas` NO tiene columna `pais` pero sí `mes`, así
 * que se filtra igual por el rango de meses.
 *
 * @param year Año del dashboard a calcular.
 * @param sb   Cliente server opcional. Si no se pasa, se crea con `createClient()`.
 */
export async function loadDB(year: number, sb?: ServerClient): Promise<ConfigDB> {
  const client = sb ?? ((await createClient()) as ServerClient);
  const { from, to } = mesRangeForYear(year);

  // Filtro por rango de meses reutilizable (gte/lte sobre "YYYY-MM").
  const inRange = <T>(table: Parameters<ServerClient["from"]>[0]) =>
    () =>
      client
        .from(table)
        .select("*")
        .gte("mes", from)
        .lte("mes", to) as unknown as RangeableBuilder<T>;

  const [
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
    config,
  ] = await Promise.all([
    fetchAll<IndColaboradorRow>("ind_colaboradores", inRange<IndColaboradorRow>("ind_colaboradores")),
    fetchAll<IndEgresoRow>("ind_egresos", inRange<IndEgresoRow>("ind_egresos")),
    fetchAll<IndAusenciaRow>("ind_ausencias", inRange<IndAusenciaRow>("ind_ausencias")),
    fetchAll<IndVacacionRow>("ind_vacaciones", inRange<IndVacacionRow>("ind_vacaciones")),
    fetchAll<IndExtraRow>("ind_extras", inRange<IndExtraRow>("ind_extras")),
    fetchAll<IndCapacitacionRow>("ind_capacitacion", inRange<IndCapacitacionRow>("ind_capacitacion")),
    fetchAll<IndMermaRow>("ind_merma", inRange<IndMermaRow>("ind_merma")),
    fetchAll<IndTerceroRow>("ind_terceros", inRange<IndTerceroRow>("ind_terceros")),
    fetchAll<IndAreaRow>("ind_areas", inRange<IndAreaRow>("ind_areas")),
    fetchAll<IndParametrosMesRow>(
      "ind_parametros_mes",
      inRange<IndParametrosMesRow>("ind_parametros_mes"),
    ),
    loadConfig(client),
  ]);

  // `loadConfig` ya devolvió el `ConfigGlobal` ensamblado. Para armar el
  // ConfigDB con `assembleDB` (que agrupa las entidades por mes) pasamos filas
  // de config VACÍAS y luego inyectamos el `__cfg` ya ensamblado. Así hay una
  // sola fuente de ensamblaje de config (loadConfig) y no releemos las tablas
  // de config dos veces.
  const input: AssembleDBInput = {
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
    config: { metas: [], leaders: [], kpiOff: [], satisfaccion: [], kv: [] },
  };

  const db = assembleDB(input);
  db.__cfg = config;
  return db;
}

// ===========================================================================
// loadMes
// ===========================================================================

/**
 * Carga de conveniencia para calcular UN mes (`mes` = "YYYY-MM").
 *
 * DECISIÓN: `loadMes(mes)` delega en `loadDB(year)` del año al que pertenece el
 * mes. Aunque el caller solo quiera computar ese mes, `compute(mes, db, ctx)`
 * internamente usa `desercion12` (ventana de 12 meses hacia atrás) y acumulados
 * (enero..mes), que requieren el contexto del año y del año previo. Devolver el
 * `ConfigDB` del rango completo garantiza que el cálculo del mes sea correcto y
 * idéntico al del dashboard. El caller hace `compute(mes, db, ctx)`.
 *
 * @param mes Mes objetivo en formato "YYYY-MM".
 * @param sb  Cliente server opcional.
 */
export async function loadMes(mes: MonthKey | string, sb?: ServerClient): Promise<ConfigDB> {
  const year = +String(mes).slice(0, 4);
  return loadDB(year, sb);
}

// Reexport de assembleMesData por si un caller necesita ensamblar un único mes
// a partir de filas ya cargadas (no se usa internamente aquí).
export { assembleMesData };

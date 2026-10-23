// =============================================================================
// lib/data/writes.ts
//
// Capa de ESCRITURA de datos normalizados. Implementa el "reemplazo por país"
// (equivalente a `ingestReplace` + `cargaPais` del sistema actual, Req 6.5):
// al cargar los datos de una entidad para un mes y un país, se BORRAN solo las
// filas de ESE país en ESE mes y se INSERTAN las nuevas. Las filas de otros
// países en el mismo mes quedan intactas.
//
// SEGURIDAD (RLS): usa el cliente server (`lib/supabase/server.ts`), que
// reenvía la sesión del usuario, de modo que todas las queries corren bajo Row
// Level Security. La policy WITH CHECK fuerza que un usuario `scope='pais'`
// solo pueda escribir su propio país; aun así, `replaceByPais` recibe el `pais`
// explícito y filtra DELETE/INSERT por él, coherente con la lógica de negocio.
//
// -----------------------------------------------------------------------------
// DECISIÓN — CÉDULAS SINTÉTICAS EN `activos` (kind="activos" → ind_colaboradores)
// -----------------------------------------------------------------------------
// La PK de `ind_colaboradores` es (cedula, mes, pais). Si al insertar activos
// nuevos hay cédulas vacías o duplicadas dentro del mismo (mes, pais), el INSERT
// colapsaría/reventaría la PK. Se aplica la MISMA estrategia que la migración
// (`supabase/migrate/migrate-data.ts`, decisión #1): la fila sin cédula (o cuya
// cédula ya apareció en el lote) recibe una cédula SINTÉTICA estable por índice
// `__row_<i>`. El motor compute() nunca usa la cédula como dato numérico ni de
// agrupación, así que esto no altera ningún KPI; solo garantiza unicidad de PK
// y que no se pierdan filas. Ver `synthesizeCedulas` más abajo.
//
// -----------------------------------------------------------------------------
// NOTA — `ind_areas` NO tiene país
// -----------------------------------------------------------------------------
// `ind_areas` se modela por mes (igual que el sistema actual), SIN columna
// `pais`. Por eso NO forma parte de los `kind` con país que soporta
// `replaceByPais`: su reemplazo sería por mes solo. La tarea foco (y Req 6.5)
// son las entidades con país; si en el futuro se necesitara reemplazar áreas,
// debe hacerse por `mes` únicamente (DELETE WHERE mes=? ; INSERT), en una
// función aparte, porque la firma por (mes, pais) de `replaceByPais` no aplica.
//
// _Requirements: 6.5_
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthKey, ParametrosMes } from "../../core/types";
import type {
  Database,
  IndAusenciaInsert,
  IndCapacitacionInsert,
  IndColaboradorInsert,
  IndEgresoInsert,
  IndExtraInsert,
  IndMermaInsert,
  IndParametrosMesInsert,
  IndTerceroInsert,
  IndVacacionInsert,
} from "../../supabase/types";

// ===========================================================================
// Cliente server tipado
// ===========================================================================

/**
 * Cliente Supabase tipado con el esquema `Database`, como el que devuelve
 * `createClient()` de `lib/supabase/server.ts`. Se recibe por parámetro (en
 * vez de crearlo adentro) para que `replaceByPais`/`upsertParams` sean puras
 * respecto de la obtención de la sesión y puedan testearse con un mock.
 */
export type ServerClient = SupabaseClient<Database>;

// ===========================================================================
// Mapeo kind → tabla ind_* y tipo Insert
// ===========================================================================

/**
 * Tipos de entidad "con país" que soporta `replaceByPais`. Cada uno mapea a su
 * tabla `ind_*`. `activos` es el único cuyo nombre difiere de la tabla
 * (`activos` → `ind_colaboradores`), por historia del dominio (en el sistema
 * actual la colección se llama `activos`).
 *
 * `areas` NO está aquí a propósito: `ind_areas` no tiene columna `pais` (ver
 * nota de cabecera).
 */
export type EntityKind =
  | "activos"
  | "egresos"
  | "ausencias"
  | "vacaciones"
  | "extras"
  | "capacitacion"
  | "merma"
  | "terceros";

/** Nombres de tabla `ind_*` con columna `pais` (para tipar el mapeo). */
type PaisTableName =
  | "ind_colaboradores"
  | "ind_egresos"
  | "ind_ausencias"
  | "ind_vacaciones"
  | "ind_extras"
  | "ind_capacitacion"
  | "ind_merma"
  | "ind_terceros";

/** kind → tabla `ind_*`. `activos` → `ind_colaboradores`; el resto 1:1. */
const TABLE: Record<EntityKind, PaisTableName> = {
  activos: "ind_colaboradores",
  egresos: "ind_egresos",
  ausencias: "ind_ausencias",
  vacaciones: "ind_vacaciones",
  extras: "ind_extras",
  capacitacion: "ind_capacitacion",
  merma: "ind_merma",
  terceros: "ind_terceros",
};

/**
 * Relación kind → tipo Insert de su tabla. Permite tipar `rows` según el kind
 * en la firma genérica de `replaceByPais` sin recurrir a `any`.
 */
export interface InsertByKind {
  activos: IndColaboradorInsert;
  egresos: IndEgresoInsert;
  ausencias: IndAusenciaInsert;
  vacaciones: IndVacacionInsert;
  extras: IndExtraInsert;
  capacitacion: IndCapacitacionInsert;
  merma: IndMermaInsert;
  terceros: IndTerceroInsert;
}

/**
 * Tipo de fila que acepta `replaceByPais` por kind: el Insert de la tabla pero
 * con `mes`/`pais` OPCIONALES, porque la función los fija a partir de sus
 * argumentos (son la fuente de verdad). Así el llamador no está obligado a
 * repetir mes/país en cada fila, pero puede incluirlos (se sobreescriben).
 */
export type RowInput<K extends EntityKind> = Omit<
  InsertByKind[K],
  "mes" | "pais"
> & {
  mes?: string;
  pais?: string;
};

// ===========================================================================
// Cédulas sintéticas para `activos` (ind_colaboradores)
// ===========================================================================

/**
 * Garantiza cédulas únicas y no vacías dentro de un lote de `activos` para el
 * mismo (mes, pais), replicando la estrategia de la migración (decisión #1):
 * una fila sin cédula —o con una cédula ya vista en el lote— recibe `__row_<i>`
 * (índice dentro del array). Es estable para un mismo lote y única dentro del
 * par (mes, país).
 *
 * Solo se aplica a `activos`; el resto de entidades no tienen PK natural por
 * cédula (usan `id` identity), así que sus cédulas pueden repetirse o ir null.
 *
 * @param rows Filas de colaboradores (ya con mes/pais seteados o no; aquí solo
 *             se normaliza la cédula).
 * @returns Nuevo array con la cédula saneada (no muta la entrada).
 */
function synthesizeCedulas(
  rows: readonly IndColaboradorInsert[],
): IndColaboradorInsert[] {
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const raw = typeof r.cedula === "string" ? r.cedula.trim() : "";
    // Vacía o ya vista en este lote ⇒ sintética estable por índice.
    const cedula = raw !== "" && !seen.has(raw) ? raw : `__row_${i}`;
    seen.add(cedula);
    return { ...r, cedula };
  });
}

// ===========================================================================
// replaceByPais
// ===========================================================================

/**
 * Reemplazo por país de UNA entidad en UN mes (Req 6.5): borra las filas de
 * `(mes, pais)` de la tabla de `kind` e inserta las nuevas `rows`, conservando
 * las filas de otros países en el mismo mes.
 *
 * Las `rows` se coaccionan a su tipo Insert y se les fija `mes` y `pais` (así el
 * llamador no necesita repetirlos en cada fila; cualquier `mes`/`pais` presente
 * en la fila se sobreescribe con los argumentos, que son la fuente de verdad).
 *
 * Para `kind="activos"` se aplica `synthesizeCedulas` para no romper la PK
 * compuesta (cedula, mes, pais) ante cédulas vacías/duplicadas en el lote.
 *
 * @param kind  Tipo de entidad con país (ver `EntityKind`).
 * @param mes   Mes `YYYY-MM`.
 * @param pais  País del lote (fuente de verdad; RLS lo refuerza en el servidor).
 * @param rows  Filas a insertar (Insert de la tabla correspondiente).
 * @param sb    Cliente server tipado (RLS). Ver `lib/supabase/server.ts`.
 * @returns Cantidad de filas insertadas.
 * @throws  Error con mensaje claro si el DELETE o el INSERT fallan.
 */
export async function replaceByPais<K extends EntityKind>(
  kind: K,
  mes: MonthKey | string,
  pais: string,
  rows: ReadonlyArray<RowInput<K>>,
  sb: ServerClient,
): Promise<number> {
  const table = TABLE[kind];

  // --- 1) Normalizar filas: fijar mes/pais; cédulas sintéticas en activos. --
  let toInsert: InsertByKind[K][];
  if (kind === "activos") {
    const colabRows = rows as ReadonlyArray<RowInput<"activos">>;
    const withMesPais = colabRows.map(
      (r): IndColaboradorInsert => ({ ...r, mes, pais }),
    );
    toInsert = synthesizeCedulas(withMesPais) as InsertByKind[K][];
  } else {
    toInsert = rows.map((r) => ({ ...r, mes, pais })) as InsertByKind[K][];
  }

  // --- 2) DELETE de las filas del país en el mes (conserva otros países). ---
  // `delete` sin `.select()` no cuenta filas; filtramos por mes y pais con
  // `.match` (todas las tablas de `EntityKind` tienen ambas columnas). RLS
  // garantiza que solo se borren filas visibles para el usuario.
  const del = await sb
    .from(table)
    .delete()
    .match({ mes, pais } as never);

  if (del.error) {
    throw new Error(
      `replaceByPais: fallo al borrar filas de "${table}" para mes=${mes} pais=${pais}: ${del.error.message}`,
    );
  }

  // Nada que insertar: el reemplazo fue solo un borrado (lote vacío).
  if (toInsert.length === 0) {
    return 0;
  }

  // --- 3) INSERT de las filas nuevas; `count: 'exact'` para el conteo. ------
  const ins = await sb
    .from(table)
    // El tipo Insert por kind es asignable a la fila de la tabla; el cast
    // puntual evita que TS pierda la correlación de la unión genérica `K`.
    .insert(toInsert as never, { count: "exact" });

  if (ins.error) {
    throw new Error(
      `replaceByPais: fallo al insertar ${toInsert.length} fila(s) en "${table}" para mes=${mes} pais=${pais}: ${ins.error.message}`,
    );
  }

  // `count` puede venir null si el backend no lo reporta; en ese caso usamos la
  // longitud del lote enviado (todas las filas se insertaron si no hubo error).
  return ins.count ?? toInsert.length;
}

// ===========================================================================
// upsertParams
// ===========================================================================

/**
 * Upsert de los parámetros de un mes/país en `ind_parametros_mes`
 * (PK/onConflict "mes,pais"). Útil durante la carga: los parámetros se guardan
 * una vez por (mes, país) y se sobreescriben si ya existían.
 *
 * @param mes    Mes `YYYY-MM`.
 * @param pais   País de los parámetros.
 * @param params JSONB de parámetros del mes (forma `ParametrosMes`).
 * @param sb     Cliente server tipado (RLS).
 * @throws Error con mensaje claro si el upsert falla.
 */
export async function upsertParams(
  mes: MonthKey | string,
  pais: string,
  params: ParametrosMes,
  sb: ServerClient,
): Promise<void> {
  const row: IndParametrosMesInsert = { mes, pais, params };

  const res = await sb
    .from("ind_parametros_mes")
    .upsert(row as never, { onConflict: "mes,pais" });

  if (res.error) {
    throw new Error(
      `upsertParams: fallo al guardar parámetros de mes=${mes} pais=${pais}: ${res.error.message}`,
    );
  }
}

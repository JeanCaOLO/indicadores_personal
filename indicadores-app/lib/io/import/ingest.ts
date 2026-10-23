// lib/io/import/ingest.ts
//
// Capa de INGESTA/persistencia del importador. Porta la lógica de carga del
// sistema actual (`out/index.html`, fuente de verdad) y la conecta con la capa
// de escritura normalizada (`lib/data/writes.ts`, `replaceByPais`):
//
//   function cargaPais(){...}                → cargaPais(ctx)
//   function ingestReplace(kind,mat){...}    → ingestEntidad + ingestMaster/ingestSingle
//   function applySatisfaccion(mat){...}     → applySatisfaccion (lectura ya en
//                                               read-workbook.ts; aquí se PERSISTE)
//
// Lo que esta tarea (16.4) IMPLEMENTA:
//   - `cargaPais(ctx)`: traduce la semántica del index (ROLE/PAIS) a una función
//     pura sobre { scope, paisScope, paisSeleccionado }.
//   - `ingestMaster(masterResult, opts)`: persiste las ENTIDADES (activos,
//     egresos, ausencias, vacaciones, extras, capacitacion, merma, terceros) con
//     reemplazo POR PAÍS (Req 6.5) vía `replaceByPais`, y la SATISFACCIÓN anual
//     en `ind_config_satisfaccion` (upsert año→valor).
//   - `ingestSingle(entidad, opts)`: análogo para una sola hoja (upload por tipo).
//
// Lo que esta tarea DEJA para 16.5 (Pantalla Administrar) — documentado:
//   - Las HOJAS DE PARÁMETROS (seleccion/ssl/servicios/bienestar/ruta) y la
//     matriz de HORAS HOMBRE. Su parseo a `ParametrosMes` y su persistencia vía
//     `upsertParams` se hace en la pantalla Administrar, donde el usuario revisa
//     y edita los `ParametrosMes` por área antes de guardar. Acá priorizamos el
//     NÚCLEO: entidades con país + satisfacción. `ingestMaster` devuelve las
//     hojas de parámetros/HH sin tocar (en el `MasterParseResult`) para que 16.5
//     las consuma.
//
// SEGURIDAD (RLS): se usa el cliente server (`ServerClient`) que reenvía la
// sesión. `replaceByPais` ya filtra DELETE/INSERT por el `pais` explícito y la
// policy WITH CHECK impide que un usuario de país escriba otro país. Además
// `cargaPais` fuerza el país correcto para usuarios de país, de modo que un
// usuario `scope='pais'` nunca puede cargar datos de otro país.
//
// Módulo con un único efecto externo: las escrituras a Supabase (vía `sb`). El
// resto (coerción de filas, agrupamiento por país) es puro.

import type { ServerClient, EntityKind, RowInput } from "../../data/writes";
import { replaceByPais } from "../../data/writes";
import type {
  EntidadParseada,
  MasterParseResult,
  Satisfaccion,
} from "./read-workbook";
import type { IndConfigSatisfaccionInsert } from "../../../supabase/types";

// ---------------------------------------------------------------------------
// Contexto de carga — reemplaza los globals ROLE/PAIS del index.
// ---------------------------------------------------------------------------

/**
 * Contexto de carga. Traduce los globals del sistema actual:
 *   - `scope`           ← scope del rol del usuario (global | pais | admin).
 *   - `paisScope`       ← país del rol cuando `scope === 'pais'` (equiv. a ROLE).
 *   - `paisSeleccionado`← país elegido en el filtro cuando el usuario es global
 *                         (equiv. a PAIS). "__all__" = "Todos".
 */
export interface CargaCtx {
  scope: "global" | "pais" | "admin";
  /** País del rol (solo relevante cuando scope === 'pais'). */
  paisScope?: string;
  /** País seleccionado en el filtro (solo relevante cuando scope !== 'pais'). */
  paisSeleccionado?: string;
}

/** Opciones de persistencia: el cliente server (RLS) + el contexto de carga. */
export interface IngestOptions extends CargaCtx {
  /** Cliente Supabase server tipado (RLS). Ver `lib/supabase/server.ts`. */
  sb: ServerClient;
}

// ---------------------------------------------------------------------------
// cargaPais — país de carga efectivo.
// Portado de out/index.html:
//   function cargaPais(){return (typeof ROLE!=="undefined"&&ROLE!=="__all__")?ROLE:(PAIS!=="__all__"?PAIS:"");}
//
// Semántica preservada:
//   - Usuario de país (scope==='pais'): devuelve SU país (paisScope). No puede
//     cargar otro país.
//   - Usuario global con país seleccionado (≠ "__all__"): devuelve ese país.
//   - Usuario global en "Todos" ("__all__" o vacío): devuelve "" ⇒ se respeta el
//     país de CADA fila del archivo.
// ---------------------------------------------------------------------------
export function cargaPais(ctx: CargaCtx): string {
  if (ctx.scope === "pais") return ctx.paisScope || "";
  const sel = ctx.paisSeleccionado || "";
  return sel && sel !== "__all__" ? sel : "";
}

// ---------------------------------------------------------------------------
// Coerción de filas parseadas (Record<string,string>) → Insert por kind.
//
// Las filas vienen de parseRows como objetos campo→string (campos del COLMAP).
// `replaceByPais` fija `mes`/`pais`, así que aquí NO los seteamos (se omiten).
// Para `activos` el campo `id` (cédula) mapea a la columna `cedula`; para las
// demás entidades con cédula (egresos/ausencias/vacaciones/extras) `id` también
// mapea a `cedula`. Los campos numéricos se coaccionan con `num()`.
// ---------------------------------------------------------------------------

/** Coerción numérica tolerante: "" / no-numérico ⇒ 0; coma decimal aceptada. */
function num(v: string | undefined): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Texto: devuelve undefined si vacío (para dejar que la columna caiga a null). */
function txt(v: string | undefined): string | undefined {
  const s = v == null ? "" : String(v);
  return s.trim() === "" ? undefined : s;
}

/**
 * Convierte una fila parseada (campo→string) al Insert de su `kind` (sin
 * mes/pais, que los fija `replaceByPais`). Centraliza el mapeo `id → cedula` y
 * la coerción numérica por entidad.
 */
function toInsertRow<K extends EntityKind>(
  kind: K,
  o: Record<string, string>,
): RowInput<K> {
  switch (kind) {
    case "activos":
      return {
        cedula: o.id ?? "",
        nombre: txt(o.nombre),
        departamento: txt(o.departamento),
        area: txt(o.area),
        sexo: txt(o.sexo),
        fecha_nacimiento: txt(o.fecha_nacimiento),
        fecha_ingreso: txt(o.fecha_ingreso),
        nivel: txt(o.nivel),
        nivel_educativo: txt(o.nivel_educativo),
        carrera: txt(o.carrera),
        movilidad: txt(o.movilidad),
        movimiento: txt(o.movimiento),
        tipo: txt(o.tipo),
        paso: txt(o.paso),
        vac_disfrutadas: num(o.vac_disfrutadas),
        vac_pendientes: num(o.vac_pendientes),
      } as unknown as RowInput<K>;
    case "egresos":
      return {
        cedula: txt(o.id) ?? null,
        nombre: txt(o.nombre),
        departamento: txt(o.departamento),
        motivo: txt(o.motivo),
        fecha_ingreso: txt(o.fecha_ingreso),
        fecha_salida: txt(o.fecha_salida),
        movilidad: txt(o.movilidad),
        recomienda: txt(o.recomienda),
      } as unknown as RowInput<K>;
    case "ausencias":
      return {
        cedula: txt(o.id) ?? null,
        nombre: txt(o.nombre),
        departamento: txt(o.departamento),
        tipo: txt(o.tipo),
        dias: num(o.dias),
      } as unknown as RowInput<K>;
    case "vacaciones":
      return {
        cedula: txt(o.id) ?? null,
        nombre: txt(o.nombre),
        departamento: txt(o.departamento),
        area: txt(o.area),
        dias: num(o.dias),
      } as unknown as RowInput<K>;
    case "extras":
      return {
        cedula: txt(o.id) ?? null,
        nombre: txt(o.nombre),
        departamento: txt(o.departamento),
        area: txt(o.area),
        horas: num(o.horas),
      } as unknown as RowInput<K>;
    case "capacitacion":
      return {
        area_conocimiento: txt(o.area_conocimiento),
        curso: txt(o.curso),
        horas: num(o.horas),
        participantes: num(o.participantes),
      } as unknown as RowInput<K>;
    case "merma":
      return {
        area: txt(o.area),
        cantidad: num(o.cantidad),
      } as unknown as RowInput<K>;
    case "terceros":
      return {
        cantidad: num(o.cantidad),
      } as unknown as RowInput<K>;
    default: {
      // Exhaustividad: todas las ramas de EntityKind están cubiertas.
      const _never: never = kind;
      throw new Error(`toInsertRow: kind no soportado: ${String(_never)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Resumen de ingesta — lo que la UI informa tras una carga.
// ---------------------------------------------------------------------------

/** Resultado de una carga: conteos por kind y conjuntos de meses/países tocados. */
export interface IngestSummary {
  /** Filas insertadas por kind (suma de todos los meses/países). */
  insertadosPorKind: Partial<Record<EntityKind, number>>;
  /** Meses "YYYY-MM" que recibieron algún reemplazo. */
  mesesTocados: string[];
  /** Países que recibieron algún reemplazo (vacío si global en "Todos" y sin filas). */
  paisesTocados: string[];
  /** Años cuya satisfacción se aplicó en ind_config_satisfaccion. */
  satisfaccionAnios: string[];
  /** Campos requeridos faltantes por entidad (Req 9.6), para avisar al usuario. */
  faltantes: { kind: EntityKind; campos: string[] }[];
}

function emptySummary(): IngestSummary {
  return {
    insertadosPorKind: {},
    mesesTocados: [],
    paisesTocados: [],
    satisfaccionAnios: [],
    faltantes: [],
  };
}

// ---------------------------------------------------------------------------
// ingestEntidad — persiste UNA entidad (todos sus meses) con reemplazo por país.
//
// Replica `ingestReplace` del index: agrupa por mes y, dentro del mes, por país
// de carga, y llama `replaceByPais(kind, mes, pais, filas, sb)` que reemplaza
// SOLO ese país en ese mes (Req 6.5).
//
// Caso "global en Todos" (país de carga = ""): el index hacía un reemplazo TOTAL
// del mes (`M(k)[kind]=groups[k]`), lo que podía borrar otros países. Aquí lo
// manejamos de forma más fiel a la intención de "carga por país": agrupamos las
// filas del mes por su propio campo `pais` y llamamos `replaceByPais` una vez
// por (mes, paisDeLaFila). Así cada país presente en el archivo reemplaza solo
// lo suyo y no se pierden países no incluidos en el archivo. Las filas sin país
// (campo vacío) se agrupan bajo "" — su reemplazo es el del país "" (coherente
// con cómo el motor las vería: sin país asignado).
//
// Para un usuario de país o global con país seleccionado, el país de carga ya
// vino forzado en cada fila por parseRows (opts.rolPais/paisCarga), así que el
// agrupamiento por `pais` produce un único grupo = ese país.
// ---------------------------------------------------------------------------
async function ingestEntidad(
  kind: EntityKind,
  entidad: EntidadParseada,
  sb: ServerClient,
  acc: IngestSummary,
): Promise<void> {
  const mesesTocados = new Set(acc.mesesTocados);
  const paisesTocados = new Set(acc.paisesTocados);
  let insertados = acc.insertadosPorKind[kind] ?? 0;

  for (const mes of Object.keys(entidad.porMes)) {
    const filasMes = entidad.porMes[mes] || [];
    if (!filasMes.length) continue;

    // Agrupar por país de la fila (ver nota de cabecera sobre "global en Todos").
    const porPais = new Map<string, Record<string, string>[]>();
    for (const o of filasMes) {
      const p = (o.pais || "").trim();
      const list = porPais.get(p);
      if (list) list.push(o);
      else porPais.set(p, [o]);
    }

    for (const [pais, filas] of porPais) {
      const rows = filas.map((o) => toInsertRow(kind, o));
      const n = await replaceByPais(kind, mes, pais, rows, sb);
      insertados += n;
      mesesTocados.add(mes);
      paisesTocados.add(pais);
    }
  }

  acc.insertadosPorKind[kind] = insertados;
  acc.mesesTocados = [...mesesTocados];
  acc.paisesTocados = [...paisesTocados];

  if (entidad.faltantes.length) {
    acc.faltantes.push({ kind, campos: entidad.faltantes.slice() });
  }
}

// ---------------------------------------------------------------------------
// applySatisfaccion — persiste la satisfacción anual (año→puntaje).
//
// En el index, `applySatisfaccion` guardaba en `DB.__cfg.satisfaccion[año]` y
// además replicaba el valor en `params.encuesta` de los 12 meses de ese año. En
// esta arquitectura normalizada la config vive en `ind_config_satisfaccion`
// (una fila por año: anio→valor), y el motor compute() lee la satisfacción desde
// `__cfg.satisfaccion` reconstruido por `assembleConfig` (lib/data/assemble.ts).
// Por eso aquí UPSERTEAMOS en `ind_config_satisfaccion` (anio→valor).
//
// NO replicamos el valor en `params.encuesta` de cada mes: compute() ya usa el
// respaldo por año de `__cfg.satisfaccion` cuando el param del mes es 0 (ver
// `encuesta:(+p.encuesta||...satisfaccion[k.slice(0,4)]...)` en el motor), de
// modo que persistir solo la config es suficiente y evita escribir en
// `ind_parametros_mes` (que gestiona 16.5). La lectura de la hoja a `{año→valor}`
// ya la hizo `applySatisfaccion` de read-workbook.ts.
// ---------------------------------------------------------------------------
export async function applySatisfaccion(
  satisfaccion: Satisfaccion,
  sb: ServerClient,
): Promise<string[]> {
  const anios = Object.keys(satisfaccion);
  if (!anios.length) return [];

  const rows: IndConfigSatisfaccionInsert[] = anios.map((y) => ({
    anio: parseInt(y, 10),
    valor: satisfaccion[y],
  }));

  const res = await sb
    .from("ind_config_satisfaccion")
    .upsert(rows as never, { onConflict: "anio" });

  if (res.error) {
    throw new Error(
      `applySatisfaccion: fallo al guardar satisfacción (${anios.join(", ")}): ${res.error.message}`,
    );
  }

  return anios.slice();
}

// ---------------------------------------------------------------------------
// ingestMaster — persiste el resultado de readMasterWorkbook.
//
// Recorre las entidades con país (EntityKind) y las persiste con reemplazo por
// país (ingestEntidad), y aplica la satisfacción anual a la config. Las hojas de
// parámetros y la matriz de horas hombre NO se tocan aquí (quedan en el
// `MasterParseResult` para la pantalla Administrar, 16.5).
//
// NOTA sobre `areas`: `ind_areas` no tiene país, así que NO es un EntityKind y
// `replaceByPais` no lo soporta. El reemplazo de áreas (por mes) se gestiona en
// 16.5; aquí se omite para no mezclar la semántica por país con la por mes.
// ---------------------------------------------------------------------------
export async function ingestMaster(
  master: MasterParseResult,
  opts: IngestOptions,
): Promise<IngestSummary> {
  const { sb } = opts;
  const summary = emptySummary();

  // Entidades con país que persistimos acá (núcleo). `areas` queda para 16.5.
  const kinds: EntityKind[] = [
    "activos",
    "egresos",
    "ausencias",
    "vacaciones",
    "extras",
    "capacitacion",
    "merma",
    "terceros",
  ];

  for (const kind of kinds) {
    const entidad = master.entidades[kind];
    if (entidad) await ingestEntidad(kind, entidad, sb, summary);
  }

  // Satisfacción anual → ind_config_satisfaccion (upsert año→valor).
  summary.satisfaccionAnios = await applySatisfaccion(master.satisfaccion, sb);

  return summary;
}

// ---------------------------------------------------------------------------
// ingestSingle — persiste UNA sola entidad (upload por tipo). Análogo a
// `upload(kind,file)` + `ingestReplace(kind,mat)` del index, pero sobre una
// `EntidadParseada` ya producida por `readSingleSheet`.
//
// Solo aplica a entidades con país (EntityKind). `areas` (sin país) se maneja en
// 16.5 por su reemplazo-por-mes.
// ---------------------------------------------------------------------------
export async function ingestSingle(
  entidad: EntidadParseada,
  opts: IngestOptions,
): Promise<IngestSummary> {
  const summary = emptySummary();
  if (!isEntityKind(entidad.kind)) {
    throw new Error(
      `ingestSingle: el kind "${entidad.kind}" no tiene país y no se persiste aquí (ver 16.5 para áreas).`,
    );
  }
  await ingestEntidad(entidad.kind, entidad, opts.sb, summary);
  return summary;
}

/** Type guard: ¿este kind es una entidad con país soportada por replaceByPais? */
function isEntityKind(kind: string): kind is EntityKind {
  return (
    kind === "activos" ||
    kind === "egresos" ||
    kind === "ausencias" ||
    kind === "vacaciones" ||
    kind === "extras" ||
    kind === "capacitacion" ||
    kind === "merma" ||
    kind === "terceros"
  );
}

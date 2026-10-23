// =============================================================================
// app/(app)/administrar/actions.ts
//
// SERVER ACTIONS de la Pantalla Administrar (tarea 16.5). Todas corren SIEMPRE
// en el servidor ("use server"), nunca en el navegador ni durante el build.
// Usan el cliente server con RLS (`lib/supabase/server`) para persistir con la
// sesión del usuario, de modo que la base aplica el aislamiento por país.
//
// -----------------------------------------------------------------------------
// VALIDACIÓN DE SCOPE/PAÍS (Req 6.1, 6.5)
// -----------------------------------------------------------------------------
// Cada acción llama a `ctxDeCarga(paisSeleccionado)`:
//   1. `requireAuth()` resuelve la sesión (redirige a /login si no hay) y el
//      scope del usuario (global | pais | admin).
//   2. Un usuario `scope === 'admin'` NO carga data (lanza). Solo global/pais.
//   3. Se arma un `CargaCtx`:
//        - scope 'pais'   → paisScope = su país (FORZADO; `cargaPais` ignora el
//          `paisSeleccionado` del cliente, así que no puede cargar otro país).
//        - scope 'global' → paisSeleccionado del filtro ("__all__" = todos).
//   `ingestMaster/ingestSingle` + `parseRows` usan `rolPais`/`paisCarga`
//   derivados de ese contexto, y `replaceByPais` recibe el país explícito; la
//   policy WITH CHECK de RLS refuerza que un usuario de país no escriba otro.
//
// -----------------------------------------------------------------------------
// CÓMO SE LEE EL ARCHIVO EN LA ACTION (elección: FormData con File)
// -----------------------------------------------------------------------------
// El cliente envía el archivo como `FormData` (campo "file", un `File`). Es el
// mecanismo más simple y nativo de las Server Actions: no requiere base64 ni
// serialización manual. En la action hacemos `await file.arrayBuffer()` y
// pasamos el `ArrayBuffer` a `readMasterWorkbook`/`readSingleSheet`, que cargan
// `xlsx` con dynamic import DENTRO del servidor (nunca en el bundle de cliente).
//
// -----------------------------------------------------------------------------
// DEPENDENCIA CON 17.1 (export de plantillas Excel)
// -----------------------------------------------------------------------------
// La DESCARGA de plantillas (plantilla maestra y por tipo) la genera el
// exportador de la tarea 17.1 (`lib/io/export/xlsx`): `masterTemplate({ mes })`
// y `dlTpl(kind, { mes })`. Esas funciones son CLIENT-SIDE (arman el workbook y
// disparan la descarga vía `document`/Blob), así que la invocación vive en el
// CLIENT COMPONENT (AdminClient) con dynamic import y manejo de ausencia, NO
// aquí: una server action no puede generar una descarga de navegador. Si 17.1
// aún no estuviera presente, el dynamic import del cliente cae en un try/catch
// que avisa que la descarga se habilita al integrar 17.1. Por eso este módulo
// de actions NO incluye acciones de descarga de plantillas.
//
// _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
// =============================================================================

"use server";

import { revalidatePath } from "next/cache";

import type { ParametrosMes } from "../../../core/types";
import { requireAuth } from "../../../lib/auth/session";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import type { ServerClient, EntityKind, RowInput } from "../../../lib/data/writes";
import { replaceByPais, upsertParams } from "../../../lib/data/writes";
import {
  readMasterWorkbook,
  readSingleSheet,
} from "../../../lib/io/import/read-workbook";
import {
  ingestMaster,
  ingestSingle,
  cargaPais,
  type CargaCtx,
} from "../../../lib/io/import/ingest";
import type { ColmapKind } from "../../../lib/io/import/colmap";
import type { ParseOptions } from "../../../lib/io/import/parse-rows";

// ===========================================================================
// Tipos de resultado (serializables hacia el cliente)
// ===========================================================================

/** Resultado uniforme de una acción (éxito/fallo + mensaje). */
export interface AdminResult {
  ok: boolean;
  message: string;
  /** Meses/países tocados y conteos (solo en cargas, para el toast). */
  detalle?: {
    mesesTocados?: string[];
    paisesTocados?: string[];
    total?: number;
    faltantes?: { kind: string; campos: string[] }[];
  };
}

const ok = (message: string, detalle?: AdminResult["detalle"]): AdminResult => ({
  ok: true,
  message,
  detalle,
});
const fail = (message: string): AdminResult => ({ ok: false, message });

// ===========================================================================
// Contexto de carga — valida scope y resuelve país de carga (Req 6.1, 6.5)
// ===========================================================================

interface CargaResuelta {
  sb: ServerClient;
  carga: CargaCtx;
  /** `rolPais`/`paisCarga` listos para parseRows (vía ParseOptions). */
  parseExtras: Pick<ParseOptions, "paisCarga" | "rolPais">;
}

/**
 * Resuelve la sesión, VALIDA el scope (admin no carga data) y arma el contexto
 * de carga por país. El `paisSeleccionado` del cliente SOLO se respeta para un
 * usuario global; para un usuario de país se ignora y se fuerza su propio país.
 */
async function ctxDeCarga(paisSeleccionado: string): Promise<CargaResuelta> {
  const ctx = await requireAuth();

  if (ctx.scope === "admin") {
    throw new Error("Tu rol administra usuarios, no carga datos de indicadores.");
  }

  const carga: CargaCtx =
    ctx.scope === "pais"
      ? { scope: "pais", paisScope: ctx.paisScope }
      : { scope: "global", paisSeleccionado };

  const sb = (await createClient()) as ServerClient;

  // `rolPais` fuerza el país para usuarios de país; `paisCarga` completa filas
  // sin país para usuarios globales con un país seleccionado.
  const parseExtras: Pick<ParseOptions, "paisCarga" | "rolPais"> = {
    rolPais: ctx.scope === "pais" ? ctx.paisScope : "__all__",
    paisCarga: cargaPais(carga),
  };

  return { sb, carga, parseExtras };
}

/** Extrae el `File` del FormData (campo "file") o lanza si no viene. */
function fileDeForm(formData: FormData): File {
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) {
    throw new Error("No se recibió ningún archivo.");
  }
  return f;
}

// ===========================================================================
// subirMaestra — carga de Plantilla Maestra (un solo archivo)
// ===========================================================================

/**
 * Lee el archivo maestro (FormData "file"), rutea sus hojas y persiste las
 * entidades con reemplazo por país + la satisfacción anual (ingestMaster).
 *
 * @param mes   Mes activo "YYYY-MM" (clave por defecto para filas sin AÑO/MES).
 * @param pais  País seleccionado en el filtro ("__all__" para global).
 * @param formData FormData con el archivo en "file".
 *
 * _Requirements: 6.2, 6.5_
 */
export async function subirMaestra(
  mes: string,
  pais: string,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const { sb, parseExtras } = await ctxDeCarga(pais);
    const file = fileDeForm(formData);
    const buf = await file.arrayBuffer();

    const opts: ParseOptions = { mesActual: mes, ...parseExtras };
    const master = await readMasterWorkbook(buf, opts);
    const summary = await ingestMaster(master, {
      sb,
      scope: parseExtras.rolPais === "__all__" ? "global" : "pais",
      paisScope: parseExtras.rolPais !== "__all__" ? parseExtras.rolPais : undefined,
      paisSeleccionado: pais,
    });

    revalidatePath("/administrar");
    const tot = Object.values(summary.insertadosPorKind).reduce((a, b) => a + (b ?? 0), 0);
    return ok(`✓ Carga maestra: ${tot} registro(s) actualizados.`, {
      mesesTocados: summary.mesesTocados,
      paisesTocados: summary.paisesTocados,
      total: tot,
      faltantes: summary.faltantes,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ===========================================================================
// subirTipo — carga de una sola hoja (upload por tipo)
// ===========================================================================

/**
 * Lee un archivo de una sola hoja y lo persiste como `kind` (reemplazo por
 * país). Usado por las tarjetas por tipo (dataCard).
 *
 * @param kind  Tipo de entidad (ColmapKind con país).
 * @param mes   Mes activo "YYYY-MM".
 * @param pais  País seleccionado ("__all__" para global).
 * @param formData FormData con el archivo en "file".
 *
 * _Requirements: 6.3, 6.5_
 */
export async function subirTipo(
  kind: ColmapKind,
  mes: string,
  pais: string,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const { sb, parseExtras } = await ctxDeCarga(pais);
    const file = fileDeForm(formData);
    const buf = await file.arrayBuffer();

    const opts: ParseOptions = { mesActual: mes, ...parseExtras };
    const entidad = await readSingleSheet(buf, kind, opts);
    const summary = await ingestSingle(entidad, {
      sb,
      scope: parseExtras.rolPais === "__all__" ? "global" : "pais",
      paisScope: parseExtras.rolPais !== "__all__" ? parseExtras.rolPais : undefined,
      paisSeleccionado: pais,
    });

    revalidatePath("/administrar");
    const tot = summary.insertadosPorKind[kind as EntityKind] ?? 0;
    return ok(`✓ ${kind}: ${tot} registro(s) actualizados.`, {
      mesesTocados: summary.mesesTocados,
      paisesTocados: summary.paisesTocados,
      total: tot,
      faltantes: summary.faltantes,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ===========================================================================
// guardarRegistros — edición manual de los registros de un tipo
// ===========================================================================

/**
 * Reemplaza (por país) los registros de un `kind` en un mes con las `filas`
 * editadas manualmente en la tabla (EditableTable). Equivale al guardado de la
 * tarjeta tras editar/agregar/eliminar filas en el sistema actual.
 *
 * Cada fila es un objeto campo→valor (string). El país efectivo lo decide el
 * scope: para un usuario de país es SU país; para global, el `pais`
 * seleccionado (si es "__all__" se agrupan por el campo `pais` de cada fila).
 *
 * @param kind  Tipo de entidad (EntityKind con país).
 * @param mes   Mes "YYYY-MM".
 * @param pais  País seleccionado ("__all__" para global).
 * @param filas Filas editadas (campo→string).
 *
 * _Requirements: 6.4, 6.5_
 */
export async function guardarRegistros(
  kind: EntityKind,
  mes: string,
  pais: string,
  filas: Record<string, string>[],
): Promise<AdminResult> {
  try {
    const { sb, parseExtras } = await ctxDeCarga(pais);

    // País efectivo por fila: usuario de país ⇒ su país; global con país
    // seleccionado ⇒ ese país; global en "Todos" ⇒ el campo `pais` de la fila.
    const forzado = parseExtras.rolPais !== "__all__" ? parseExtras.rolPais : "";
    const seleccion = pais !== "__all__" ? pais : "";
    const paisDe = (f: Record<string, string>) =>
      (forzado || seleccion || (f.pais ?? "")).trim();

    // Agrupar por país efectivo para reemplazar solo ese país en el mes.
    const porPais = new Map<string, Record<string, string>[]>();
    for (const f of filas) {
      const p = paisDe(f);
      const list = porPais.get(p);
      if (list) list.push(f);
      else porPais.set(p, [f]);
    }

    let total = 0;
    const paisesTocados: string[] = [];
    for (const [p, fs] of porPais) {
      const rows = fs.map((f) => toRow(kind, f));
      total += await replaceByPais(kind, mes, p, rows, sb);
      paisesTocados.push(p);
    }

    revalidatePath("/administrar");
    return ok(`✓ ${kind}: ${total} registro(s) guardados.`, {
      mesesTocados: [mes],
      paisesTocados,
      total,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ===========================================================================
// guardarParametros — edición de ParametrosMes por área (ParamGrid)
// ===========================================================================

/**
 * Upsert de los `ParametrosMes` del mes/país editados en el ParamGrid. El país
 * efectivo lo decide el scope (usuario de país ⇒ su país; global ⇒ el país
 * seleccionado; en "__all__" no hay un país único ⇒ se guarda bajo "").
 *
 * @param mes    Mes "YYYY-MM".
 * @param pais   País seleccionado ("__all__" para global).
 * @param params Parámetros del mes (forma ParametrosMes, ya coaccionados).
 *
 * _Requirements: 6.4_
 */
export async function guardarParametros(
  mes: string,
  pais: string,
  params: ParametrosMes,
): Promise<AdminResult> {
  try {
    const { sb, parseExtras } = await ctxDeCarga(pais);
    const rolPais = parseExtras.rolPais ?? "__all__";
    const paisEfectivo =
      rolPais !== "__all__" ? rolPais : pais !== "__all__" ? pais : "";

    await upsertParams(mes, paisEfectivo, params, sb);
    revalidatePath("/administrar");
    return ok("✓ Parámetros guardados.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ===========================================================================
// limpiarMesesVacios — descarta meses sin ningún registro
// ===========================================================================

/**
 * Limpia los meses que quedaron SIN datos reales: para cada `mes` registrado en
 * `ind_meses`, si NO hay filas en ninguna entidad de datos (colaboradores,
 * egresos, …) ni parámetros con contenido, se elimina la fila de `ind_meses` y
 * el `ind_parametros_mes` asociado. Replica la intención de
 * `limpiarMesesVacios()` del sistema actual, adaptada al esquema normalizado.
 *
 * Usa el cliente admin (service_role) porque es una tarea administrativa que
 * recorre todos los meses/países; solo scope admin/global/pais autenticado la
 * dispara (requireAuth). Es idempotente.
 */
export async function limpiarMesesVacios(): Promise<AdminResult> {
  try {
    const ctx = await requireAuth();
    if (ctx.scope === "admin") {
      throw new Error("Tu rol no gestiona datos de indicadores.");
    }

    const sb = createAdminClient();

    // Meses registrados.
    const mesesRes = await sb.from("ind_meses").select("mes");
    if (mesesRes.error) throw new Error(mesesRes.error.message);
    const meses = ((mesesRes.data ?? []) as { mes: string }[]).map((r) => r.mes);

    const dataTables = [
      "ind_colaboradores",
      "ind_egresos",
      "ind_ausencias",
      "ind_vacaciones",
      "ind_extras",
      "ind_capacitacion",
      "ind_merma",
      "ind_terceros",
      "ind_areas",
    ] as const;

    let removidos = 0;
    for (const mes of meses) {
      let tieneDatos = false;
      for (const t of dataTables) {
        const c = await sb.from(t).select("mes", { count: "exact", head: true }).eq("mes", mes);
        if ((c.count ?? 0) > 0) {
          tieneDatos = true;
          break;
        }
      }
      if (tieneDatos) continue;

      // Sin datos: borrar parámetros y la fila del mes.
      await sb.from("ind_parametros_mes").delete().eq("mes", mes);
      const del = await sb.from("ind_meses").delete().eq("mes", mes);
      if (!del.error) removidos++;
    }

    revalidatePath("/administrar");
    return ok(
      removidos
        ? `✓ Se eliminaron ${removidos} mes(es) sin datos.`
        : "No hay meses vacíos para limpiar.",
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ===========================================================================
// toRow — coerción de una fila editada (campo→string) al Insert de su kind.
// Idéntica semántica a `toInsertRow` de lib/io/import/ingest.ts (id → cedula,
// coerción numérica), replicada aquí para la edición manual.
// ===========================================================================

function num(v: string | undefined): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function txt(v: string | undefined): string | undefined {
  const s = v == null ? "" : String(v);
  return s.trim() === "" ? undefined : s;
}

function toRow<K extends EntityKind>(kind: K, o: Record<string, string>): RowInput<K> {
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
      const _never: never = kind;
      throw new Error(`toRow: kind no soportado: ${String(_never)}`);
    }
  }
}

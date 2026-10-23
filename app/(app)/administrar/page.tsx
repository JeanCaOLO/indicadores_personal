// =============================================================================
// app/(app)/administrar/page.tsx  —  Pantalla Administrar (tarea 16.5)
//
// SERVER COMPONENT. Responsabilidades (ver enunciado 16.5):
//   1. `const ctx = await requireAuth()` → sesión + scope + paisScope (redirige
//      a /login si no hay sesión).
//   2. Lee `searchParams` (async en Next 16): mes, anio, pais.
//   3. Carga el MES ACTUAL con `loadMes(mes)` (RLS filtra el país en el
//      servidor) para mostrar los registros existentes y su estado de carga.
//   4. Resuelve el `pais` EFECTIVO (Req 5.5/6.5): scope 'pais' fija su país (no
//      lo cambia el usuario vía URL); global toma el de `searchParams`.
//   5. Pasa al `AdminClient` (use client) los registros del mes + parámetros +
//      scope + paisScope + país/mes/año actuales.
//
// RENDER DINÁMICO (no prerender): igual que dashboard/corporativa/usuarios, la
// página lee cookies vía `requireAuth` (I/O de request) y datos de Supabase
// (loadMes), por lo que bajo `cacheComponents: true` (Next 16) es DINÁMICA por
// defecto y el build NO se conecta a Supabase. NO se usa `export const dynamic`
// (incompatible con cacheComponents). Se invoca `connection()` para forzar el
// render dinámico explícitamente, consistente con la pantalla Usuarios.
//
// _Requirements: 6.1, 6.2, 6.3, 6.4_
// =============================================================================

import { connection } from "next/server";

import type { ConfigDB, MesData, ParametrosMes } from "../../../core/types";
import { loadMes } from "../../../lib/data/queries";
import { requireAuth } from "../../../lib/auth/session";
import { normalizeParams } from "../../../lib/data/assemble";
import AdminClient, {
  type AdminRegistros,
} from "../../../components/admin/AdminClient";
import type { EntKind } from "../../../components/admin/admin-constants";

/** Año por defecto (igual que el resto de las vistas / sistema actual: 2026). */
const DEFAULT_YEAR = 2026;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Entidades editables de un MesData, en el orden de las tarjetas. */
const ENT_KINDS: EntKind[] = [
  "activos",
  "egresos",
  "ausencias",
  "vacaciones",
  "extras",
  "terceros",
  "merma",
  "capacitacion",
];

/**
 * Convierte el `MesData` del mes (motor) a registros campo→string editables por
 * tarjeta. El motor usa `id` (cédula); las entidades sin cédula (capacitacion,
 * merma, terceros) no la tienen. Todo se stringifica para la edición en inputs.
 */
function toRegistros(d: MesData | undefined): AdminRegistros {
  const out: AdminRegistros = {
    activos: [],
    egresos: [],
    ausencias: [],
    vacaciones: [],
    extras: [],
    terceros: [],
    merma: [],
    capacitacion: [],
  };
  if (!d) return out;
  for (const kind of ENT_KINDS) {
    const rows = (d[kind] ?? []) as unknown as Record<string, unknown>[];
    out[kind] = rows.map((r) => {
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        o[k] = v == null ? "" : String(v);
      }
      return o;
    });
  }
  return out;
}

export default async function AdministrarPage(props: {
  searchParams: SearchParams;
}) {
  // Fuerza render dinámico bajo `cacheComponents`.
  await connection();

  // 1. Sesión + scope (redirige a /login si no hay sesión).
  const ctx = await requireAuth();

  // 2. searchParams.
  const sp = await props.searchParams;
  const year = Number(one(sp.anio)) || DEFAULT_YEAR;
  const mes = one(sp.mes) ?? `${year}-07`;

  // 4. País EFECTIVO: scope 'pais' fija su país; global toma el de la URL.
  const paisFijado = ctx.scope === "pais";
  const pais = paisFijado ? ctx.paisScope : (one(sp.pais) ?? "__all__");

  // 3. Carga del mes (RLS filtra país en el servidor). Si falla, banner.
  let db: ConfigDB | null = null;
  let loadError: string | null = null;
  try {
    db = await loadMes(mes);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Error cargando los datos";
  }

  if (loadError || !db) {
    return (
      <div id="v-admin">
        <div className="banner">
          No se pudieron cargar los datos del mes. Verificá la conexión con la
          base de datos. <b>Detalle:</b> {loadError ?? "sin datos"}.
        </div>
      </div>
    );
  }

  const mesData = db[mes as keyof ConfigDB] as MesData | undefined;
  const registros = toRegistros(mesData);
  const params: ParametrosMes = normalizeParams(mesData?.params ?? null);

  return (
    <AdminClient
      mes={mes}
      year={year}
      pais={pais}
      paisFijado={paisFijado}
      registros={registros}
      params={params}
    />
  );
}

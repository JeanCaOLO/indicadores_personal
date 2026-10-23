// =============================================================================
// app/(app)/dashboard/page.tsx  —  Dashboard Operativo (tarea 14.1)
//
// SERVER COMPONENT. Responsabilidades (ver enunciado 14.1):
//   1. `const ctx = await requireAuth()` → { user, profile, rol, scope, paisScope }.
//      (requireAuth redirige a /login si no hay sesión).
//   2. Lee `searchParams` (async en Next 16) → mes, anio, view, anio2, pais,
//      dep, area, dens. Resuelve el año (de `anio`, default 2026 igual que la
//      FilterBar).
//   3. `const db = await loadDB(year)` — respeta RLS (el server client reenvía
//      la sesión; scope 'pais' solo recibe su país).
//   4. Resuelve el `paisScope` EFECTIVO (Req 5.5): si `ctx.scope==='pais'` el
//      país es `ctx.paisScope` (FIJO, no lo puede cambiar el usuario vía URL);
//      si es global, el de `searchParams` (o "__all__").
//   5. Pasa `db` (JSON plano serializable) + filtros + scope al CLIENT COMPONENT
//      (DashboardClient), que corre el motor en memoria y renderiza.
//
// RENDER DINÁMICO (no prerender):
//   La página depende de la sesión del usuario (cookies vía `requireAuth` →
//   `next/headers`) y de datos de Supabase (vía `loadDB`). El proyecto usa
//   Next 16 con `cacheComponents: true` (ver next.config.ts): bajo Cache
//   Components una ruta es DINÁMICA por defecto y solo se prerenderiza si su
//   contenido se cachea explícitamente (`"use cache"`). Como esta página lee
//   cookies (I/O dinámico, no cacheable), Next NO la prerenderiza en `next build`
//   — por eso el build no intenta conectarse a Supabase. Además, bajo Cache
//   Components `export const dynamic` es INCOMPATIBLE y el build lo rechaza, así
//   que NO se usa: el comportamiento dinámico ya es el default. Si `loadDB`
//   falla en runtime (sin envs), se muestra un banner de error en vez de romper.
//
// _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 17.1_
// =============================================================================

import type { ConfigDB } from "../../../core/types";
import { loadDB } from "../../../lib/data/queries";
import { requireAuth } from "../../../lib/auth/session";
import DashboardClient from "../../../components/dashboard/DashboardClient";

/** Año por defecto (igual que la FilterBar / sistema actual: 2026). */
const DEFAULT_YEAR = 2026;

/** searchParams de Next 16 (async). */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Primer valor de un query param (los params pueden venir como array). */
function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage(props: { searchParams: SearchParams }) {
  // 1. Sesión + scope (redirige a /login si no hay sesión).
  const ctx = await requireAuth();

  // 2. searchParams (async en Next 16).
  const sp = await props.searchParams;
  const year = Number(one(sp.anio)) || DEFAULT_YEAR;
  const mes = one(sp.mes) ?? `${year}-07`; // CUR por defecto, igual que la FilterBar
  const view = (one(sp.view) ?? "mes") as "mes" | "acum" | "comp";
  const year2 = Number(one(sp.anio2)) || year - 1;
  const dep = one(sp.dep) ?? "__all__";
  const area = one(sp.area) ?? "__all__";

  // 4. paisScope EFECTIVO (Req 5.5): scope 'pais' fija el país del rol y NO
  //    acepta el `pais` de la URL; global toma el de la URL (o consolidado).
  const paisFijado = ctx.scope === "pais";
  const pais = paisFijado ? ctx.paisScope : (one(sp.pais) ?? "__all__");

  // 3. Carga de datos (RLS aplica el filtro de país en el servidor).
  let db: ConfigDB | null = null;
  let loadError: string | null = null;
  try {
    db = await loadDB(year);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Error cargando los datos";
  }

  if (loadError || !db) {
    return (
      <div id="v-dash">
        <div className="banner">
          No se pudieron cargar los datos del dashboard. Verificá la conexión con
          la base de datos. <b>Detalle:</b> {loadError ?? "sin datos"}.
        </div>
      </div>
    );
  }

  // 5. Pasa db (serializable) + filtros + scope al cliente.
  return (
    <DashboardClient
      db={db}
      year={year}
      mes={mes}
      view={view}
      year2={year2}
      pais={pais}
      dep={dep}
      area={area}
      paisFijado={paisFijado}
    />
  );
}

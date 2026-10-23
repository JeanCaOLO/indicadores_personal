// =============================================================================
// app/(app)/comparativa/page.tsx
//
// Vista Comparativa (tarea 14.3) — SERVER COMPONENT.
//
// FUENTE DE VERDAD: out/index.html → `renderComp()` (pestaña "Tipo" de la Vista
// Corporativa), que compara un indicador por país (lado a lado) o por año.
//
// Responsabilidades del Server Component:
//   1. GUARD DE SESIÓN: `requireAuth()` (redirige a /login si no hay sesión) y
//      resuelve `paisScope` (RBAC). Con scope 'pais' la comparación se restringe
//      a su país (Req 8.3); RLS además excluye en el servidor las filas de otros
//      países, así que el `db` que llega ya viene filtrado.
//   2. CARGA DE DATOS: el modo "por año" compara los 12 meses de VARIOS años
//      (YEARS=2024..2027). `loadDB(year)` trae `[year-1 .. year]`, insuficiente
//      para comparar años arbitrarios, así que aquí cargamos `loadDB` de CADA
//      año del rango y fusionamos las claves de mes en un único `ConfigDB`.
//   3. Pasa `db` + `paisScope` + año del filtro + `today` a ComparativaClient.
//
// RENDER DINÁMICO: la vista depende de la sesión del usuario (cookies/RLS) y de
// searchParams. El proyecto usa `cacheComponents` en next.config, que es
// INCOMPATIBLE con `export const dynamic = "force-dynamic"` (Next lo rechaza en
// build). Bajo `cacheComponents` el render dinámico se obtiene automáticamente
// al acceder a APIs de request-time: aquí `requireAuth()` lee cookies y
// `await searchParams` lee la query, por lo que la página NUNCA se prerenderiza
// —equivalente a force-dynamic— sin necesidad del segment config.
//
// _Requirements: 8.1, 8.2, 8.3_
// =============================================================================

import ComparativaClient from "../../../components/comparativa/ComparativaClient";
import type { ConfigDB, MonthKey } from "../../../core/types";
import { requireAuth } from "../../../lib/auth/session";
import { loadDB } from "../../../lib/data/queries";
import { createClient } from "../../../lib/supabase/server";

// Años base del dominio (const YEARS=[2024,2025,2026,2027] en out/index.html).
const YEARS = [2024, 2025, 2026, 2027];
const DEFAULT_YEAR = 2026;

/**
 * Carga un `ConfigDB` que cubre TODOS los años de `YEARS` fusionando las claves
 * de mes de cada `loadDB(year)`. Reutiliza un único server client para respetar
 * RLS con la sesión del usuario (el filtrado por país lo aplica la base).
 */
async function loadAllYears(): Promise<ConfigDB> {
  const sb = await createClient();
  const dbs = await Promise.all(YEARS.map((y) => loadDB(y, sb)));

  // Merge: __cfg es el mismo en todos; las claves de mes se unen. Si dos cargas
  // traen la misma clave de mes (solapamiento del rango [y-1..y]), prevalece la
  // última (son idénticas: mismas filas de la misma base).
  const merged: ConfigDB = { __cfg: dbs[0].__cfg } as ConfigDB;
  for (const db of dbs) {
    for (const key of Object.keys(db)) {
      if (key === "__cfg") continue;
      merged[key as MonthKey] = db[key as MonthKey];
    }
  }
  return merged;
}

export default async function ComparativaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // 1. Sesión + scope (Req 8.3: scope 'pais' restringe a su país).
  const ctx = await requireAuth();

  // 2. Año inicial desde el filtro de la URL.
  const sp = await searchParams;
  const anioRaw = Array.isArray(sp.anio) ? sp.anio[0] : sp.anio;
  const anioInicial = Number(anioRaw) || DEFAULT_YEAR;

  // 3. DB de todos los años (para comparar por año) — RLS ya filtró el país.
  const db = await loadAllYears();

  return (
    <ComparativaClient
      db={db}
      paisScope={ctx.paisScope}
      anioInicial={anioInicial}
      today={Date.now()}
    />
  );
}

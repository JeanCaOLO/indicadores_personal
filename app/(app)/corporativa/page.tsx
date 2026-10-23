// =============================================================================
// app/(app)/corporativa/page.tsx  (tarea 14.2)
//
// Vista Corporativa — SERVER COMPONENT.
//
// Responsabilidades (arquitectura del plan):
//   1. GUARD DE SESIÓN: `requireAuth()` (redirige a /login si no hay sesión).
//   2. Lee los searchParams (`anio`, `pais`) para elegir el año y el país.
//   3. `const db = await loadDB(year)` — trae el ConfigDB del año (+ arrastre).
//   4. Pasa db + filtros (año, país) + paisScope a un CLIENT COMPONENT
//      (`CorporativaClient`) que arma la matriz corriendo el motor por cada mes.
//
// SCOPE DE PAÍS (Req 7.1 / RBAC):
//   - scope 'pais'   → el país está FIJADO a `ctx.paisScope` (no hay selector
//                      libre: el usuario solo ve su país).
//   - scope 'global' → el país es libre; sale de `searchParams.pais` (default
//                      "__all__" = Consolidado).
//   - scope 'admin'  → no ve data; el layout ya lo redirige/oculta, pero por
//                      las dudas se trata como "__all__".
//
// RENDER DINÁMICO: la página depende de datos de Supabase (cookies de sesión +
// RLS) y NO debe prerenderizarse en build. El proyecto usa `cacheComponents:
// true` (Next 16), que rechaza `export const dynamic = "force-dynamic"`; en su
// lugar se invoca `connection()` al inicio (ver abajo) para forzar el render
// dinámico de forma equivalente.
//
// Fuente de verdad: out/index.html → `renderPres()` (la lógica de la matriz se
// porta en el cliente, `CorporativaClient`).
//
// _Requirements: 7.1, 7.2, 7.3_
// =============================================================================

import { connection } from "next/server";

import { loadDB } from "../../../lib/data/queries";
import { requireAuth } from "../../../lib/auth/session";
import type { ConfigDB } from "../../../core/types";
import CorporativaClient from "../../../components/corporativa/CorporativaClient";

// Render DINÁMICO (nunca prerender en build): la vista depende de datos de
// Supabase (sesión + RLS). El proyecto usa `cacheComponents: true` (Next 16),
// que es incompatible con `export const dynamic = "force-dynamic"`. Bajo ese
// modo, el render se vuelve dinámico al leer datos de request (cookies vía
// requireAuth + `await searchParams`); además invocamos `connection()` al
// inicio para forzar explícitamente el render dinámico y evitar cualquier
// intento de prerender con datos en build.

/** Año válido a partir del query param `anio` (fallback: año actual). */
function parseYear(anio: string | undefined): number {
  const y = anio != null ? parseInt(String(anio), 10) : NaN;
  if (Number.isFinite(y) && y >= 2000 && y <= 2100) return y;
  return new Date().getFullYear();
}

export default async function CorporativaPage({
  searchParams,
}: {
  // En Next 15 los searchParams de un Server Component llegan como Promise.
  searchParams: Promise<{ anio?: string; pais?: string }>;
}) {
  // Fuerza render dinámico bajo `cacheComponents` (equivalente a force-dynamic).
  await connection();

  // `today` del request: se lee DESPUÉS de `connection()`, en el camino ya
  // marcado como dinámico. Es dato de request (hora del servidor al atender la
  // petición), no un valor "puro" de render: por eso se aísla aquí.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // 1. Guard de sesión. Devuelve el ctx con scope + paisScope resueltos.
  const ctx = await requireAuth();

  // 2. searchParams → año + país.
  const sp = await searchParams;
  const year = parseYear(sp.anio);

  // Scope de país: si el rol es de país, el país queda FIJADO (no selector
  // libre); si es global/admin, se respeta el query param (default Consolidado).
  const scopeFijado = ctx.paisScope !== "__all__";
  const pais = scopeFijado
    ? ctx.paisScope
    : sp.pais && sp.pais.trim() !== ""
      ? sp.pais
      : "__all__";

  // 3. Carga del ConfigDB del año (loadDB respeta RLS por país vía server client).
  let db: ConfigDB;
  try {
    db = await loadDB(year);
  } catch {
    // Si la base no está disponible, se entrega un DB vacío: el cliente muestra
    // el estado "sin datos" con la misma apariencia que el sistema actual.
    db = {
      __cfg: { metas: {}, leaders: [], sysUrl: "", kpiOff: [], satisfaccion: {} },
    } as ConfigDB;
  }

  // Años disponibles para el selector: una ventana alrededor del año pedido
  // (el sistema actual deriva YEARS de los meses con datos; acá ofrecemos una
  // ventana estable para no reconstruirla en el servidor).
  const years = yearWindow(year);

  // 4. Delegar la matriz al cliente (corre el motor por cada mes del año).
  return (
    <CorporativaClient
      db={db}
      year={year}
      years={years}
      pais={pais}
      scopeFijado={scopeFijado}
      today={now}
    />
  );
}

/** Ventana de años para el selector (año pedido ± 2, descendente). */
function yearWindow(year: number): number[] {
  const out: number[] = [];
  for (let y = year + 1; y >= year - 3; y--) out.push(y);
  return out;
}

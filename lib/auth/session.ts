// =============================================================================
// lib/auth/session.ts
//
// Guard de sesión SERVER-SIDE para el App Router. Resuelve el usuario
// autenticado y su perfil/rol, y expone helpers para proteger Server
// Components y Route Handlers.
//
// ⚠️ SERVER-ONLY: usa el server client (`lib/supabase/server`), que lee
// cookies vía `next/headers`, y `redirect` de `next/navigation`. No importar
// desde código de cliente ("use client").
//
// SEGURIDAD: se usa `supabase.auth.getUser()` (valida el JWT contra el servidor
// de Supabase), NO `getSession()` del lado cliente (que confía en la cookie sin
// revalidar). Así el usuario que devolvemos está verificado por el servidor.
//
// Flujo:
//   1. getUser() → usuario autenticado (o null).
//   2. Se lee `ind_perfiles` (join a `ind_roles`) del usuario.
//   3. Si el perfil existe y está activo, se arma `Perfil & { rol: Rol }`.
//   4. Si falta usuario/perfil o el perfil está inactivo → null.
//
// Todos los errores se degradan a `null` (no se lanza): un fallo de red o una
// fila ausente se tratan como "sin sesión".
//
// _Requirements: 12.2, 12.4, 13.5_
// =============================================================================

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import type { PaisScope, Perfil, Rol, Scope } from "../../core/types";
import type { IndPerfilRow, IndRolRow } from "../../supabase/types";
import { createClient } from "../supabase/server";
import { canManageUsers, canSeeData, resolvePaisScope } from "./rbac";

// ===========================================================================
// Tipos
// ===========================================================================

/** Perfil garantizado con su rol embebido (lo que devuelve `getSession`). */
export type PerfilConRol = Perfil & { rol: Rol };

/** Resultado de `getSession`: usuario verificado + su perfil/rol, o null. */
export interface Session {
  user: User;
  profile: PerfilConRol;
}

/**
 * Contexto de sesión listo para usar en las páginas protegidas. Desestructura
 * el rol y pre-calcula los valores de RBAC que las vistas necesitan:
 *   - `scope`     → scope del rol (global/pais/admin).
 *   - `paisScope` → filtro de país ("__all__" o país) resuelto con RBAC.
 */
export interface SessionCtx {
  user: User;
  profile: PerfilConRol;
  rol: Rol;
  scope: Scope;
  paisScope: PaisScope;
}

// ===========================================================================
// buildPerfil — lógica PURA y testeable de "armar Perfil desde filas"
// ===========================================================================

/**
 * Normaliza el `scope` crudo (texto libre del row) a un `Scope` válido.
 * Cualquier valor desconocido se degrada a 'pais' (el más restrictivo de los
 * que ven data), nunca a 'global'/'admin', por seguridad.
 */
function normalizeScope(scope: string | null | undefined): Scope {
  if (scope === "global" || scope === "admin" || scope === "pais") {
    return scope;
  }
  return "pais";
}

/**
 * Arma un `Perfil & { rol: Rol }` a partir de las filas crudas de
 * `ind_perfiles` e `ind_roles`. PURA (sin I/O): se puede testear sin Supabase.
 *
 * Devuelve `null` si:
 *   - no hay fila de perfil, o
 *   - el perfil está inactivo (`activo === false`), o
 *   - no hay fila de rol asociada.
 *
 * @param perfilRow Fila de `ind_perfiles` (o null).
 * @param rolRow    Fila de `ind_roles` del rol del perfil (o null).
 */
export function buildPerfil(
  perfilRow: IndPerfilRow | null | undefined,
  rolRow: IndRolRow | null | undefined,
): PerfilConRol | null {
  if (!perfilRow) return null;
  if (perfilRow.activo === false) return null;
  if (!rolRow) return null;

  const rol: Rol = {
    id: rolRow.id,
    nombre: rolRow.nombre,
    scope: normalizeScope(rolRow.scope),
    pais: rolRow.pais ?? null,
  };

  return {
    user_id: perfilRow.user_id,
    email: perfilRow.email ?? "",
    nombre: perfilRow.nombre ?? "",
    rol_id: perfilRow.rol_id,
    rol,
    activo: perfilRow.activo,
  };
}

// ===========================================================================
// getSession
// ===========================================================================

/**
 * Resuelve la sesión actual del SERVIDOR.
 *
 * 1. `auth.getUser()` valida el JWT contra Supabase (seguro en el servidor).
 * 2. Lee `ind_perfiles` del usuario con join a `ind_roles` (vía RLS).
 * 3. Arma el `Perfil & { rol }` con `buildPerfil`.
 *
 * Devuelve `null` si no hay usuario, no hay perfil, el perfil está inactivo o
 * ocurre cualquier error (nunca lanza).
 */
export async function getSession(): Promise<Session | null> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return null;

    // Perfil del usuario. Se hacen dos queries (perfil y luego rol) en vez de
    // un embed `rol:ind_roles(*)`: los tipos del esquema están escritos a mano
    // (sin la clave `Relationships` que el query builder tipado de supabase-js
    // espera), por lo que el resultado inferido del select colapsa a `never`.
    // Igual que en lib/data/queries.ts, se castea el resultado al Row tipado.
    const perfilRes = await supabase
      .from("ind_perfiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    const perfilError = perfilRes.error;
    const perfilRow = perfilRes.data as IndPerfilRow | null;

    if (perfilError || !perfilRow) return null;

    const rolRes = await supabase
      .from("ind_roles")
      .select("*")
      .eq("id", perfilRow.rol_id)
      .maybeSingle();
    const rolError = rolRes.error;
    const rolRow = rolRes.data as IndRolRow | null;

    if (rolError) return null;

    const profile = buildPerfil(perfilRow, rolRow);
    if (!profile) return null;

    return { user, profile };
  } catch {
    // Fallo de red, variables de entorno ausentes, etc. → sin sesión.
    return null;
  }
}

// ===========================================================================
// toSessionCtx — deriva el contexto de RBAC (pura)
// ===========================================================================

/**
 * Convierte una `Session` en el `SessionCtx` listo para las páginas,
 * pre-calculando `scope` y `paisScope`. PURA.
 */
export function toSessionCtx(session: Session): SessionCtx {
  const rol = session.profile.rol;
  return {
    user: session.user,
    profile: session.profile,
    rol,
    scope: rol.scope,
    paisScope: resolvePaisScope(rol),
  };
}

// ===========================================================================
// requireAuth
// ===========================================================================

/**
 * Exige una sesión válida. Si no hay sesión, redirige a `/login` (no retorna).
 * Si hay sesión, devuelve el `SessionCtx` (user + profile + rol + scope +
 * paisScope) listo para la página.
 *
 * Uso típico en un Server Component:
 *   const ctx = await requireAuth();
 *   // ctx.paisScope, ctx.scope, ctx.profile...
 */
export async function requireAuth(): Promise<SessionCtx> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return toSessionCtx(session);
}

// ===========================================================================
// requireScope (opcional)
// ===========================================================================

/**
 * Exige una sesión cuyo scope esté dentro de `scopes`. Útil para páginas
 * restringidas (p.ej. la de usuarios, que solo permite admin/global).
 *
 * - Sin sesión → redirige a `/login`.
 * - Con sesión pero scope no permitido → redirige a `/dashboard` (el usuario
 *   está autenticado pero no autorizado para esta vista).
 *
 * @param scopes Lista de scopes permitidos.
 */
export async function requireScope(scopes: Scope[]): Promise<SessionCtx> {
  const ctx = await requireAuth();
  if (!scopes.includes(ctx.scope)) {
    redirect("/dashboard");
  }
  return ctx;
}

// Reexport de los helpers de RBAC para que las páginas importen todo desde
// lib/auth/session si lo prefieren.
export { canManageUsers, canSeeData, resolvePaisScope };

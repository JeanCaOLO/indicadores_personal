// =============================================================================
// app/(app)/usuarios/page.tsx
//
// Pantalla Usuarios (tarea 14.4). SERVER COMPONENT.
//
// Flujo:
//   1. `const ctx = await requireAuth()` → sesión verificada (o redirect a
//      /login).
//   2. Si `!canManageUsers(ctx.scope)` → renderiza SOLO un banner de "permiso
//      insuficiente" y NO carga ni muestra el CRUD (Req 14.4).
//   3. Si puede gestionar (scope admin/global), carga roles y usuarios con el
//      cliente `service_role` (lib/supabase/admin) EN EL SERVIDOR: `auth.admin`
//      y la omisión de RLS son necesarias para listar todos los usuarios y
//      perfiles. El service_role NUNCA llega al cliente.
//   4. Renderiza la UI con paridad a renderUsuarios (`.usr-wrap`, tarjetas
//      `.card.adm-card` con `.ch`/`.cb`, formularios `.usr-form`, tablas).
//      Las partes interactivas son client components que invocan las Server
//      Actions de ./actions.ts.
//
// RENDER DINÁMICO: la página usa datos de Supabase en tiempo de ejecución y la
// sesión del usuario (cookies). El proyecto usa `cacheComponents: true`
// (Next 16), que es INCOMPATIBLE con `export const dynamic = "force-dynamic"`.
// Bajo ese modo el render dinámico se obtiene al leer APIs de request-time
// (aquí `requireAuth()` lee cookies); además invocamos `connection()` al inicio
// para forzar explícitamente el render dinámico y evitar cualquier intento de
// prerender con datos en el build (el build NO se conecta a Supabase).
//
// _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
// =============================================================================

import { connection } from "next/server";

import type { Rol } from "../../../core/types";
import type { IndPerfilRow, IndRolRow } from "../../../supabase/types";
import { requireAuth } from "../../../lib/auth/session";
import { canManageUsers } from "../../../lib/auth/rbac";
import { createAdminClient } from "../../../lib/supabase/admin";
import CrearUsuarioForm from "../../../components/usuarios/CrearUsuarioForm";
import RolesSeccion from "../../../components/usuarios/RolesSeccion";
import UsuariosTabla, {
  type UsuarioRow,
} from "../../../components/usuarios/UsuariosTabla";

/** Normaliza un scope crudo del row a un Scope válido (degrada a 'pais'). */
function toScope(scope: string | null | undefined): Rol["scope"] {
  return scope === "global" || scope === "admin" || scope === "pais"
    ? scope
    : "pais";
}

/**
 * Carga roles y usuarios (perfiles) con el cliente admin, en el servidor.
 * Devuelve los roles y la lista de usuarios ya en la forma que consumen los
 * componentes (join perfil→rol resuelto en memoria por `rol_id`).
 */
async function cargarDatos(): Promise<{
  roles: Rol[];
  usuarios: UsuarioRow[];
}> {
  const sb = createAdminClient();

  const [rolesRes, perfilesRes] = await Promise.all([
    sb.from("ind_roles").select("*").order("nombre"),
    sb.from("ind_perfiles").select("*").order("nombre"),
  ]);

  if (rolesRes.error) {
    throw new Error(`Error al cargar roles: ${rolesRes.error.message}`);
  }
  if (perfilesRes.error) {
    throw new Error(`Error al cargar usuarios: ${perfilesRes.error.message}`);
  }

  const rolesRows = (rolesRes.data ?? []) as IndRolRow[];
  const perfilRows = (perfilesRes.data ?? []) as IndPerfilRow[];

  const roles: Rol[] = rolesRows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    scope: toScope(r.scope),
    pais: r.pais ?? null,
  }));

  const usuarios: UsuarioRow[] = perfilRows.map((p) => ({
    user_id: p.user_id,
    nombre: p.nombre ?? "",
    email: p.email ?? "",
    rol_id: p.rol_id,
    activo: p.activo,
  }));

  return { roles, usuarios };
}

export default async function UsuariosPage() {
  // Fuerza render dinámico bajo `cacheComponents` (equivalente a force-dynamic).
  await connection();

  // 1. Sesión verificada (redirect a /login si no hay).
  const ctx = await requireAuth();

  // 2. Permiso insuficiente → banner, sin CRUD (Req 14.4).
  if (!canManageUsers(ctx.scope)) {
    return (
      <div id="v-usuarios">
        <div className="banner">No tenés permisos para gestionar usuarios.</div>
      </div>
    );
  }

  // 3. Cargar datos con el cliente admin (server-side).
  let roles: Rol[] = [];
  let usuarios: UsuarioRow[] = [];
  try {
    ({ roles, usuarios } = await cargarDatos());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div id="v-usuarios">
        <div className="banner">Error al cargar: {msg}</div>
      </div>
    );
  }

  // 4. UI con paridad a renderUsuarios.
  return (
    <div id="v-usuarios">
      <div className="adm-head">
        <h2>Usuarios y roles</h2>
      </div>
      <div className="banner">
        Los usuarios de un país solo ven la data de ese país. Global ve todo.
        Admin no ve data, solo gestiona usuarios.
      </div>
      <div className="usr-wrap">
        <CrearUsuarioForm roles={roles} />
        <UsuariosTabla usuarios={usuarios} roles={roles} />
        <RolesSeccion roles={roles} />
      </div>
    </div>
  );
}

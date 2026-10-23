// =============================================================================
// app/(app)/usuarios/actions.ts
//
// SERVER ACTIONS de la Pantalla Usuarios (tarea 14.4). Todo el CRUD de usuarios
// y roles vive acá como Server Actions ("use server"): se ejecutan SIEMPRE en
// el servidor en tiempo de ejecución (nunca en el navegador ni durante el
// build), y usan el cliente `service_role` (lib/supabase/admin) que necesita
// `auth.admin.createUser` / `deleteUser` y omite RLS para listar/escribir.
//
// NOTA: un módulo "use server" SOLO puede exportar funciones async. Las
// constantes, tipos y helpers puros (ActionResult, BASE_ROLE_IDS, isValidEmail,
// isValidPassword, slugifyRoleId, normalizeScope, MIN_PASSWORD_LENGTH) viven en
// ./validations.ts.
//
// SEGURIDAD (Req 14.1, 14.4): CADA acción llama a `assertCanManage()` ANTES de
// tocar nada. Esa función resuelve la sesión del llamador con `requireAuth`
// (valida el JWT contra Supabase) y exige scope 'admin' o 'global'
// (`canManageUsers`). Si el scope no alcanza, lanza y la operación se aborta:
// el service_role jamás se usa sin autorización previa del usuario.
//
// VALIDACIÓN (Req 14.5): `crearUsuario` exige un correo con formato válido y una
// contraseña de al menos 6 caracteres antes de crear nada.
//
// Reutiliza las operaciones ya probadas de supabase/migrate/migrate-users.ts:
// `findAuthUserIdByEmail`, `createAuthUser`, `upsertPerfil`.
//
// Tras cada mutación exitosa se hace `revalidatePath('/usuarios')` para que el
// Server Component recargue la lista.
//
// _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
// =============================================================================

"use server";

import { revalidatePath } from "next/cache";

import type { Scope } from "../../../core/types";
import type { IndPerfilInsert, IndRolInsert } from "../../../supabase/types";
import { requireAuth } from "../../../lib/auth/session";
import { canManageUsers } from "../../../lib/auth/rbac";
import { createAdminClient } from "../../../lib/supabase/admin";
import {
  createAuthUser,
  findAuthUserIdByEmail,
  upsertPerfil,
} from "../../../supabase/migrate/migrate-users";
import {
  BASE_ROLE_IDS,
  MIN_PASSWORD_LENGTH,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  normalizeScope,
  slugifyRoleId,
  type ActionResult,
} from "./validations";

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

// ===========================================================================
// Guard de autorización — se ejecuta al inicio de CADA acción.
// ===========================================================================

/**
 * Exige que el llamador tenga una sesión válida con scope 'admin' o 'global'.
 * Devuelve el scope autorizado. Lanza si no está autorizado (la acción aborta
 * antes de tocar nada). `requireAuth` ya redirige a /login si no hay sesión.
 *
 * _Requirements: 14.1, 14.4_
 */
async function assertCanManage(): Promise<Scope> {
  const ctx = await requireAuth();
  if (!canManageUsers(ctx.scope)) {
    throw new Error("Permiso insuficiente para gestionar usuarios.");
  }
  return ctx.scope;
}

/** Envuelve una acción con el guard + manejo uniforme de errores. */
async function guarded(
  run: () => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    await assertCanManage();
    return await run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg);
  }
}

// ===========================================================================
// Acciones de USUARIOS
// ===========================================================================

/**
 * Crea un usuario: Supabase Auth (`auth.admin.createUser`) + perfil en
 * `ind_perfiles` (upsert). Valida correo y contraseña (Req 14.5) y que el
 * correo no exista ya en Auth.
 *
 * _Requirements: 14.1, 14.2, 14.5_
 */
export async function crearUsuario(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const nombre = String(formData.get("nombre") ?? "").trim();
    const emailRaw = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const rol_id = String(formData.get("rol_id") ?? "").trim();

    // Validación de inputs (Req 14.5).
    if (!isValidEmail(emailRaw)) {
      return fail("Correo inválido.");
    }
    if (!isValidPassword(password)) {
      return fail(
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      );
    }
    if (!rol_id) {
      return fail("Seleccioná un rol.");
    }

    const email = normalizeEmail(emailRaw);
    const sb = createAdminClient();

    // ¿El correo ya existe en Auth? (evita "duplicate" opaco).
    const existing = await findAuthUserIdByEmail(sb, email);
    if (existing) {
      return fail("Ese correo ya existe.");
    }

    const userId = await createAuthUser(sb, email, password);

    const perfil: IndPerfilInsert = {
      user_id: userId,
      email,
      nombre: nombre || null,
      rol_id,
      activo: true,
    };
    await upsertPerfil(sb, perfil);

    revalidatePath("/usuarios");
    return ok("Usuario creado.");
  });
}

/**
 * Actualiza el rol y/o el estado activo de un usuario (update `ind_perfiles`).
 *
 * _Requirements: 14.1, 14.2_
 */
export async function actualizarUsuario(
  userId: string,
  patch: { rol_id: string; activo: boolean },
): Promise<ActionResult> {
  return guarded(async () => {
    if (!userId) return fail("Usuario inválido.");
    if (!patch.rol_id) return fail("Rol inválido.");

    const sb = createAdminClient();
    const { error } = await sb
      .from("ind_perfiles")
      .update({ rol_id: patch.rol_id, activo: patch.activo })
      .eq("user_id", userId);

    if (error) return fail(`Error al guardar: ${error.message}`);

    revalidatePath("/usuarios");
    return ok("Guardado.");
  });
}

/**
 * Elimina un usuario: borra su perfil en `ind_perfiles` y luego el usuario de
 * Supabase Auth (`auth.admin.deleteUser`).
 *
 * _Requirements: 14.1_
 */
export async function eliminarUsuario(userId: string): Promise<ActionResult> {
  return guarded(async () => {
    if (!userId) return fail("Usuario inválido.");

    const sb = createAdminClient();

    // Primero el perfil (FK a auth.users), luego el usuario de Auth.
    const { error: perfilErr } = await sb
      .from("ind_perfiles")
      .delete()
      .eq("user_id", userId);
    if (perfilErr) return fail(`Error al eliminar perfil: ${perfilErr.message}`);

    const { error: authErr } = await sb.auth.admin.deleteUser(userId);
    if (authErr) return fail(`Error al eliminar usuario: ${authErr.message}`);

    revalidatePath("/usuarios");
    return ok("Usuario eliminado.");
  });
}

// ===========================================================================
// Acciones de ROLES
// ===========================================================================

/**
 * Crea un rol en `ind_roles` con alcance 'pais'|'global'|'admin'. Para scope
 * 'pais' exige país. Deriva el id como slug del nombre (igual que el
 * Sistema_Actual).
 *
 * _Requirements: 14.3_
 */
export async function crearRol(formData: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const nombre = String(formData.get("nombre") ?? "").trim();
    const scope = normalizeScope(String(formData.get("scope") ?? "pais"));
    const paisRaw = String(formData.get("pais") ?? "").trim();
    const pais = scope === "pais" ? paisRaw : null;

    if (!nombre) return fail("Nombre del rol requerido.");
    if (scope === "pais" && !pais) return fail("Indicá el país.");

    const id = slugifyRoleId(nombre);
    if (!id) return fail("Nombre del rol inválido.");

    const sb = createAdminClient();
    const rol: IndRolInsert = { id, nombre, scope, pais };
    const { error } = await sb.from("ind_roles").insert(rol);

    if (error) return fail(`Error: ${error.message}`);

    revalidatePath("/usuarios");
    return ok("Rol agregado.");
  });
}

/**
 * Elimina un rol de `ind_roles`. Los roles base no se pueden eliminar.
 *
 * _Requirements: 14.3_
 */
export async function eliminarRol(id: string): Promise<ActionResult> {
  return guarded(async () => {
    if (!id) return fail("Rol inválido.");
    if (BASE_ROLE_IDS.includes(id)) {
      return fail("No se puede eliminar un rol base.");
    }

    const sb = createAdminClient();
    const { error } = await sb.from("ind_roles").delete().eq("id", id);

    if (error) {
      return fail("No se pudo eliminar (¿hay usuarios usándolo?).");
    }

    revalidatePath("/usuarios");
    return ok("Rol eliminado.");
  });
}

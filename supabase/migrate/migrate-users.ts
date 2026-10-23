// =============================================================================
// supabase/migrate/migrate-users.ts
//
// Script de migración/creación de usuarios y roles hacia Supabase Auth.
//
// El login del Sistema_Actual guarda cada usuario en la tabla propia
// `olo_indicadores_usuarios` con la contraseña como hash PBKDF2 casero
// (`pass_hash` + `pass_salt`). Supabase Auth NO admite importar hashes PBKDF2
// arbitrarios, por lo que las contraseñas antiguas NO son portables.
//
// Estrategia (Requisito 15.5, ver design.md → "Migración de usuarios"):
//   1. Asegurar los roles base en `ind_roles` (idempotente, upsert onConflict id).
//      Los roles ya se siembran en la migración SQL 012_profiles_auth.sql; este
//      paso garantiza que existan aunque el SQL no se haya aplicado todavía y
//      mantiene el script autocontenido.
//   2. Por cada usuario, crearlo en Supabase Auth con `admin.createUser`
//      usando su email + una CONTRASEÑA TEMPORAL conocida (`email_confirm:true`).
//      La contraseña vieja NO se migra; los usuarios deben cambiarla al ingresar.
//      (Alternativa contemplada en el diseño: enviar invitación/reset por email,
//      pero eso requiere SMTP configurado. La contraseña temporal es más robusta
//      para este entorno y es la decisión adoptada aquí.)
//   3. Crear/actualizar `ind_perfiles` vinculando `auth.users.id` ↔ `rol_id`
//      (upsert onConflict user_id), preservando el scope y el país vía el rol.
//
// Idempotencia: re-ejecutar el script NO duplica usuarios ni perfiles. Si el
// usuario ya existe en Auth (se detecta listando y filtrando por email), se
// reutiliza su `id` existente en vez de crearlo de nuevo; el perfil se re-upserta
// sobre la misma PK (`user_id`).
//
// ⚠️ SOLO SERVIDOR. Usa el cliente `service_role` (omite RLS; `auth.admin`
//    disponible). NUNCA debe importarse en código de cliente.
//
// Requiere las variables de entorno (ver `.env.local.example`):
//   - NEXT_PUBLIC_SUPABASE_URL   → URL del proyecto Supabase.
//   - SUPABASE_SERVICE_ROLE_KEY  → clave secreta service_role (solo servidor).
//
// Modo dry-run (`--dry-run`): NO escribe en Supabase ni crea usuarios; solo
// reporta qué roles/usuarios/perfiles se crearían. En dry-run NO se construye el
// cliente admin, por lo que no requiere variables de entorno (igual que
// migrate-data.ts).
//
// Cómo correrlo (Windows / PowerShell, Node 24):
//
//   # Dry-run: no escribe nada ni requiere env vars. Lista lo que haría.
//   npx tsx supabase/migrate/migrate-users.ts --dry-run
//
//   # Migración real con la contraseña temporal por defecto ("Olo12345*").
//   npx tsx supabase/migrate/migrate-users.ts
//
//   # Migración real con una contraseña temporal propia.
//   npx tsx supabase/migrate/migrate-users.ts --password=MiClaveTemporal*1
//
// También se puede controlar por variables de entorno:
//   MIGRATE_USERS_DRY_RUN=1          (equivale a --dry-run)
//   MIGRATE_USERS_PASSWORD=...       (equivale a --password=...)
//
// _Requirements: 15.5_
// =============================================================================

import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { IndPerfilInsert, IndRolInsert } from "../types";
import { createAdminClient } from "../../lib/supabase/admin";

// ===========================================================================
// Contraseña temporal por defecto.
// ===========================================================================
//
// Las contraseñas del Sistema_Actual (PBKDF2 casero) NO son portables a
// Supabase Auth. Se crea cada usuario con esta contraseña temporal conocida y
// `email_confirm:true`; los usuarios deben cambiarla en su primer ingreso.
export const DEFAULT_TEMP_PASSWORD = "Olo12345*";

// ===========================================================================
// Roles base (idempotentes). Mismos id/nombre/scope/pais que 012_profiles_auth.sql.
// ===========================================================================
export const BASE_ROLES: IndRolInsert[] = [
  { id: "global", nombre: "Global", scope: "global", pais: null },
  { id: "admin", nombre: "Administrador", scope: "admin", pais: null },
  { id: "costa_rica", nombre: "Costa Rica", scope: "pais", pais: "Costa Rica" },
  { id: "venezuela", nombre: "Venezuela", scope: "pais", pais: "Venezuela" },
];

// ===========================================================================
// Usuarios reales del Sistema_Actual (tabla olo_indicadores_usuarios).
// ===========================================================================

/** Un usuario a migrar: email + nombre visible + rol (id de ind_roles). */
export interface MigrateUser {
  email: string;
  nombre: string;
  rol_id: string;
}

/**
 * Los 7 usuarios reales actuales, con su rol (y por lo tanto su scope/país vía
 * `ind_roles`). Las contraseñas NO se incluyen: no son portables.
 */
export const USERS: MigrateUser[] = [
  { email: "mmontanes@ologistics.com", nombre: "Mary Montanes", rol_id: "global" },
  { email: "jalvarez@ologistics.com", nombre: "J. Alvarez", rol_id: "global" },
  { email: "lamador@ologistics.com", nombre: "Liliana Amador", rol_id: "costa_rica" },
  { email: "hchavarria@ologistics.com", nombre: "Heisell Chavarria", rol_id: "costa_rica" },
  { email: "mrojas@ologistics.com", nombre: "Mainor Rojas", rol_id: "costa_rica" },
  { email: "zalvarez@ologistics.com", nombre: "Zorymar Alvarez", rol_id: "venezuela" },
  { email: "admin@olo.com", nombre: "Administrador", rol_id: "admin" },
];

// ===========================================================================
// Lógica pura reutilizable y testeable
// ===========================================================================

/**
 * Deriva un nombre legible a partir de un email cuando no se conoce el nombre
 * real. Toma la parte local (antes de `@`), separa por `.`/`_`/`-`/`+` y
 * capitaliza cada palabra. P. ej. `maria.perez@x.com` → "Maria Perez".
 * Si la parte local queda vacía, devuelve el email tal cual.
 */
export function deriveNombreFromEmail(email: string): string {
  const local = String(email).split("@")[0] ?? "";
  const parts = local
    .split(/[._+-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return parts.length > 0 ? parts.join(" ") : email;
}

/** Normaliza un email para comparación (trim + lowercase). */
export function normalizeEmail(email: string): string {
  return String(email).trim().toLowerCase();
}

/**
 * Valida la lista de usuarios a migrar contra los roles disponibles. Devuelve
 * la lista de problemas encontrados (vacía si todo es correcto). Comprueba:
 *  - email no vacío y con una `@`;
 *  - rol_id referencia un rol existente;
 *  - no hay emails duplicados (comparación case-insensitive).
 */
export function validateUsers(
  users: MigrateUser[],
  roles: IndRolInsert[] = BASE_ROLES,
): string[] {
  const problems: string[] = [];
  const roleIds = new Set(roles.map((r) => r.id));
  const seen = new Set<string>();

  for (const u of users) {
    const email = normalizeEmail(u.email);
    if (email === "" || !email.includes("@")) {
      problems.push(`Email inválido: "${u.email}"`);
    }
    if (!roleIds.has(u.rol_id)) {
      problems.push(`Usuario ${u.email}: rol desconocido "${u.rol_id}"`);
    }
    if (seen.has(email)) {
      problems.push(`Email duplicado: "${u.email}"`);
    }
    seen.add(email);
  }
  return problems;
}

/** Garantiza un nombre visible: usa el provisto o lo deriva del email. */
export function resolveNombre(u: MigrateUser): string {
  const n = (u.nombre ?? "").trim();
  return n !== "" ? n : deriveNombreFromEmail(u.email);
}

// ===========================================================================
// Resultado de la migración (para reporte y tests)
// ===========================================================================

export type UserAction = "created" | "reused" | "would-create" | "would-reuse";

export interface UserResult {
  email: string;
  rol_id: string;
  /** Id de auth.users (uuid) si se conoce; null en dry-run sin cliente. */
  userId: string | null;
  /** Qué se hizo (o se haría) con el usuario de Auth. */
  action: UserAction;
}

export interface MigrateUsersResult {
  /** Filas de roles aseguradas (o que se asegurarían) en ind_roles. */
  rolesEnsured: number;
  /** Resultado por usuario. */
  users: UserResult[];
  /** Perfiles upserteados (o que se upsertearían) en ind_perfiles. */
  perfilesUpserted: number;
}

// ===========================================================================
// Operaciones contra Supabase (roles / Auth / perfiles)
// ===========================================================================

/**
 * Asegura los roles base en `ind_roles` (upsert idempotente onConflict `id`).
 * Devuelve cuántas filas se enviaron.
 */
export async function ensureRoles(
  sb: SupabaseClient,
  roles: IndRolInsert[] = BASE_ROLES,
): Promise<number> {
  const { error } = await sb.from("ind_roles").upsert(roles, { onConflict: "id" });
  if (error) {
    throw new Error(`upsert ind_roles falló: ${error.message}`);
  }
  return roles.length;
}

/**
 * Busca un usuario de Auth por email paginando `auth.admin.listUsers`. Devuelve
 * su `id` (uuid) o `null` si no existe. La comparación es case-insensitive.
 */
export async function findAuthUserIdByEmail(
  sb: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = normalizeEmail(email);
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`listUsers falló: ${error.message}`);
    }
    const users = data?.users ?? [];
    const found = users.find(
      (u) => normalizeEmail(u.email ?? "") === target,
    );
    if (found) return found.id;
    // Última página: supabase devuelve menos de `perPage` usuarios.
    if (users.length < perPage) return null;
  }
}

/**
 * Crea el usuario en Supabase Auth con la contraseña temporal y
 * `email_confirm:true`. Devuelve el `id` (uuid) del usuario creado.
 */
export async function createAuthUser(
  sb: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) {
    throw new Error(
      `createUser falló para ${email}: ${error?.message ?? "sin usuario en la respuesta"}`,
    );
  }
  return data.user.id;
}

/**
 * Upsert de un perfil en `ind_perfiles` (onConflict `user_id`). Idempotente.
 */
export async function upsertPerfil(
  sb: SupabaseClient,
  perfil: IndPerfilInsert,
): Promise<void> {
  const { error } = await sb
    .from("ind_perfiles")
    .upsert(perfil, { onConflict: "user_id" });
  if (error) {
    throw new Error(`upsert ind_perfiles falló (${perfil.email}): ${error.message}`);
  }
}

// ===========================================================================
// Orquestación
// ===========================================================================

export interface MigrateUsersOptions {
  /** Contraseña temporal con la que crear los usuarios en Auth. */
  password?: string;
  /** Si true, NO escribe nada ni crea usuarios: solo reporta qué haría. */
  dryRun?: boolean;
  /** Lista de usuarios a migrar (por defecto, los 7 reales). */
  users?: MigrateUser[];
  /** Roles base a asegurar (por defecto, BASE_ROLES). */
  roles?: IndRolInsert[];
}

/**
 * Migra roles + usuarios + perfiles.
 *
 * En modo real (`dryRun` falso) `sb` debe ser un cliente `service_role`:
 *   - asegura los roles base en `ind_roles`;
 *   - por cada usuario: reutiliza su id de Auth si ya existe, o lo crea con la
 *     contraseña temporal + `email_confirm:true`;
 *   - upserta el perfil en `ind_perfiles` vinculando `user_id` ↔ `rol_id`.
 *
 * En modo dry-run `sb` puede ser `null`: no se toca la base; se reporta cuántos
 * roles/perfiles se escribirían y qué se haría con cada usuario.
 */
export async function migrateUsers(
  sb: SupabaseClient | null,
  opts: MigrateUsersOptions = {},
): Promise<MigrateUsersResult> {
  const password = opts.password ?? DEFAULT_TEMP_PASSWORD;
  const dryRun = opts.dryRun ?? false;
  const users = opts.users ?? USERS;
  const roles = opts.roles ?? BASE_ROLES;

  // Validación previa: aborta antes de tocar nada si la lista es incoherente.
  const problems = validateUsers(users, roles);
  if (problems.length > 0) {
    throw new Error(
      `Lista de usuarios inválida:\n  - ${problems.join("\n  - ")}`,
    );
  }

  if (!dryRun && !sb) {
    throw new Error(
      "migrateUsers en modo real requiere un cliente Supabase (service_role).",
    );
  }

  // --- 1) Roles base -------------------------------------------------------
  const rolesEnsured =
    dryRun || !sb ? roles.length : await ensureRoles(sb, roles);

  // --- 2) + 3) Usuarios de Auth y perfiles ---------------------------------
  const results: UserResult[] = [];
  let perfilesUpserted = 0;

  for (const u of users) {
    const email = normalizeEmail(u.email);
    const nombre = resolveNombre(u);

    if (dryRun || !sb) {
      // Sin cliente no podemos saber si el usuario ya existe: reportamos la
      // intención ("would-create") sin tocar nada.
      results.push({
        email,
        rol_id: u.rol_id,
        userId: null,
        action: "would-create",
      });
      perfilesUpserted++;
      continue;
    }

    // Real: reutiliza el usuario de Auth si ya existe; si no, créalo.
    const existingId = await findAuthUserIdByEmail(sb, email);
    const userId = existingId ?? (await createAuthUser(sb, email, password));
    const action: UserAction = existingId ? "reused" : "created";

    const perfil: IndPerfilInsert = {
      user_id: userId,
      email,
      nombre,
      rol_id: u.rol_id,
      activo: true,
    };
    await upsertPerfil(sb, perfil);
    perfilesUpserted++;

    results.push({ email, rol_id: u.rol_id, userId, action });
  }

  return { rolesEnsured, users: results, perfilesUpserted };
}

// ===========================================================================
// CLI runner
// ===========================================================================

export interface CliOptions {
  dryRun: boolean;
  password: string;
}

/** Parsea argumentos de CLI y variables de entorno en opciones. */
export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined>,
): CliOptions {
  let dryRun =
    env.MIGRATE_USERS_DRY_RUN === "1" || env.MIGRATE_USERS_DRY_RUN === "true";
  let password = env.MIGRATE_USERS_PASSWORD?.trim()
    ? env.MIGRATE_USERS_PASSWORD
    : DEFAULT_TEMP_PASSWORD;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--password=")) {
      const v = arg.slice("--password=".length);
      if (v.length > 0) password = v;
    }
  }
  return { dryRun, password };
}

/** Imprime el resultado de la migración de forma legible. */
function reportResult(result: MigrateUsersResult, dryRun: boolean): void {
  const verbo = dryRun ? "se asegurarían" : "aseguradas";
  console.log(`\n=== ROLES ===`);
  console.log(`  ind_roles: ${result.rolesEnsured} filas ${verbo}`);

  console.log(`\n=== USUARIOS ===`);
  for (const u of result.users) {
    const id = u.userId ? ` (id=${u.userId})` : "";
    console.log(`  ${u.email} → rol=${u.rol_id} [${u.action}]${id}`);
  }

  const vperfil = dryRun ? "se upsertearían" : "upserteados";
  console.log(`\n=== PERFILES ===`);
  console.log(`  ind_perfiles: ${result.perfilesUpserted} ${vperfil}`);
}

/**
 * Punto de entrada del script.
 *
 * En `--dry-run` NO se construye el cliente admin (ni se requieren env vars):
 * solo se reporta qué roles/usuarios/perfiles se crearían. En modo real se usa
 * el cliente `service_role` para crear usuarios en Auth y escribir ind_*.
 */
export async function main(
  argv: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const { dryRun, password } = parseArgs(argv, env);
  console.log(
    `migrate-users: dry-run=${dryRun ? "sí" : "no"} ` +
      `password=${dryRun ? "(no se usa en dry-run)" : "(temporal, oculta)"}`,
  );
  if (!dryRun) {
    console.log(
      "⚠️  Las contraseñas del sistema viejo NO se migran. Cada usuario se crea " +
        "con una contraseña temporal; deben cambiarla en su primer ingreso.",
    );
  }

  // En dry-run NO necesitamos cliente admin (ni env vars).
  const sb = dryRun ? null : createAdminClient();

  const result = await migrateUsers(sb, { password, dryRun });
  reportResult(result, dryRun);
}

// Ejecuta `main()` solo si el módulo se corre directamente (no al importarlo).
const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

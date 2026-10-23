// =============================================================================
// test/migrate-users.test.ts
//
// Verifica la LÓGICA PURA de supabase/migrate/migrate-users.ts (tarea 10.3):
//   - deriveNombreFromEmail: derivar un nombre legible de un email;
//   - validateUsers:         validar emails, roles y duplicados;
//   - resolveNombre:         usar el nombre provisto o derivarlo;
//   - parseArgs:             flags --dry-run / --password y env vars;
//   - migrateUsers(null, {dryRun:true}): la orquestación en dry-run NO toca la
//     base (sb=null) y reporta qué haría con roles/usuarios/perfiles.
//
// No toca Supabase: el dry-run corre con `sb = null`, sin cliente admin.
// =============================================================================

import { describe, expect, it } from "vitest";

import {
  BASE_ROLES,
  DEFAULT_TEMP_PASSWORD,
  USERS,
  deriveNombreFromEmail,
  migrateUsers,
  parseArgs,
  resolveNombre,
  validateUsers,
  type MigrateUser,
} from "../supabase/migrate/migrate-users";

describe("deriveNombreFromEmail", () => {
  it("capitaliza y separa la parte local por . _ + -", () => {
    expect(deriveNombreFromEmail("maria.perez@x.com")).toBe("Maria Perez");
    expect(deriveNombreFromEmail("juan_carlos@x.com")).toBe("Juan Carlos");
    expect(deriveNombreFromEmail("ana-lucia@x.com")).toBe("Ana Lucia");
    expect(deriveNombreFromEmail("JDOE@x.com")).toBe("Jdoe");
  });

  it("devuelve el email si la parte local queda vacía", () => {
    expect(deriveNombreFromEmail("@x.com")).toBe("@x.com");
  });
});

describe("resolveNombre", () => {
  it("usa el nombre provisto cuando no está vacío", () => {
    expect(resolveNombre({ email: "a@x.com", nombre: "Ana", rol_id: "global" })).toBe("Ana");
  });

  it("deriva del email cuando el nombre está vacío", () => {
    expect(resolveNombre({ email: "ana.perez@x.com", nombre: "  ", rol_id: "global" })).toBe(
      "Ana Perez",
    );
  });
});

describe("validateUsers", () => {
  it("acepta la lista real de 7 usuarios con los roles base", () => {
    expect(validateUsers(USERS, BASE_ROLES)).toEqual([]);
    expect(USERS).toHaveLength(7);
  });

  it("detecta email inválido, rol desconocido y duplicados", () => {
    const bad: MigrateUser[] = [
      { email: "sin-arroba", nombre: "X", rol_id: "global" },
      { email: "ok@x.com", nombre: "Y", rol_id: "no_existe" },
      { email: "dup@x.com", nombre: "A", rol_id: "global" },
      { email: "DUP@x.com", nombre: "B", rol_id: "global" },
    ];
    const problems = validateUsers(bad, BASE_ROLES);
    expect(problems.some((p) => p.includes("Email inválido"))).toBe(true);
    expect(problems.some((p) => p.includes("rol desconocido"))).toBe(true);
    expect(problems.some((p) => p.includes("duplicado"))).toBe(true);
  });
});

describe("parseArgs", () => {
  it("por defecto: no dry-run y contraseña temporal por defecto", () => {
    const o = parseArgs([], {});
    expect(o.dryRun).toBe(false);
    expect(o.password).toBe(DEFAULT_TEMP_PASSWORD);
  });

  it("flags --dry-run y --password= tienen prioridad", () => {
    const o = parseArgs(["--dry-run", "--password=MiClave*1"], {});
    expect(o.dryRun).toBe(true);
    expect(o.password).toBe("MiClave*1");
  });

  it("respeta las env vars MIGRATE_USERS_*", () => {
    const o = parseArgs([], {
      MIGRATE_USERS_DRY_RUN: "1",
      MIGRATE_USERS_PASSWORD: "DesdeEnv*2",
    });
    expect(o.dryRun).toBe(true);
    expect(o.password).toBe("DesdeEnv*2");
  });
});

describe("migrateUsers (dry-run, sin cliente)", () => {
  it("reporta roles, usuarios y perfiles sin tocar la base", async () => {
    const result = await migrateUsers(null, { dryRun: true });

    // 4 roles base asegurados; 7 usuarios → 7 perfiles.
    expect(result.rolesEnsured).toBe(BASE_ROLES.length);
    expect(result.perfilesUpserted).toBe(USERS.length);
    expect(result.users).toHaveLength(USERS.length);

    // En dry-run sin cliente: cada usuario reporta "would-create" y sin userId.
    for (const u of result.users) {
      expect(u.action).toBe("would-create");
      expect(u.userId).toBeNull();
    }

    // Los roles reportados preservan scope/país de los usuarios.
    const roles = new Set(result.users.map((u) => u.rol_id));
    expect(roles).toEqual(new Set(["global", "costa_rica", "venezuela", "admin"]));
  });

  it("aborta si la lista de usuarios es inválida", async () => {
    const bad: MigrateUser[] = [{ email: "x", nombre: "X", rol_id: "nope" }];
    await expect(migrateUsers(null, { dryRun: true, users: bad })).rejects.toThrow(
      /Lista de usuarios inválida/,
    );
  });

  it("en modo real exige un cliente Supabase", async () => {
    await expect(migrateUsers(null, { dryRun: false })).rejects.toThrow(
      /requiere un cliente Supabase/,
    );
  });
});

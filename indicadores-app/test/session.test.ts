// =============================================================================
// test/session.test.ts
//
// Tests unitarios de la lógica PURA de `lib/auth/session.ts` (tarea 10.1):
// `buildPerfil` (armar Perfil+Rol desde filas crudas) y `toSessionCtx`
// (derivar scope/paisScope). `getSession`/`requireAuth` no se testean contra
// Supabase real (dependen de red/cookies); la lógica testeable se factorizó
// en estas funciones puras.
//
// _Validates: Requirements 12.2, 12.4, 13.5_
// =============================================================================

import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { IndPerfilRow, IndRolRow } from "../supabase/types";
import { buildPerfil, toSessionCtx, type Session } from "../lib/auth/session";

function perfilRow(overrides: Partial<IndPerfilRow> = {}): IndPerfilRow {
  return {
    user_id: "u1",
    email: "a@b.com",
    nombre: "Ana",
    rol_id: "r_pais_cr",
    activo: true,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function rolRow(overrides: Partial<IndRolRow> = {}): IndRolRow {
  return {
    id: "r_pais_cr",
    nombre: "País Costa Rica",
    scope: "pais",
    pais: "Costa Rica",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildPerfil", () => {
  it("arma Perfil con rol embebido desde filas válidas", () => {
    const p = buildPerfil(perfilRow(), rolRow());
    expect(p).not.toBeNull();
    expect(p!.user_id).toBe("u1");
    expect(p!.email).toBe("a@b.com");
    expect(p!.activo).toBe(true);
    expect(p!.rol).toEqual({
      id: "r_pais_cr",
      nombre: "País Costa Rica",
      scope: "pais",
      pais: "Costa Rica",
    });
  });

  it("null si no hay fila de perfil", () => {
    expect(buildPerfil(null, rolRow())).toBeNull();
    expect(buildPerfil(undefined, rolRow())).toBeNull();
  });

  it("null si el perfil está inactivo", () => {
    expect(buildPerfil(perfilRow({ activo: false }), rolRow())).toBeNull();
  });

  it("null si no hay fila de rol", () => {
    expect(buildPerfil(perfilRow(), null)).toBeNull();
    expect(buildPerfil(perfilRow(), undefined)).toBeNull();
  });

  it("degrada un scope desconocido a 'pais' (seguridad)", () => {
    const p = buildPerfil(perfilRow(), rolRow({ scope: "superuser" }));
    expect(p!.rol.scope).toBe("pais");
  });

  it("normaliza email/nombre nulos a cadena vacía", () => {
    const p = buildPerfil(perfilRow({ email: null, nombre: null }), rolRow());
    expect(p!.email).toBe("");
    expect(p!.nombre).toBe("");
  });

  it("acepta scope global/admin sin país", () => {
    const g = buildPerfil(perfilRow(), rolRow({ scope: "global", pais: null }));
    expect(g!.rol.scope).toBe("global");
    expect(g!.rol.pais).toBeNull();
  });
});

describe("toSessionCtx", () => {
  const fakeUser = { id: "u1" } as unknown as User;

  function session(rol: IndRolRow): Session {
    return {
      user: fakeUser,
      profile: buildPerfil(perfilRow(), rol)!,
    };
  }

  it("deriva scope y paisScope para un rol de país", () => {
    const ctx = toSessionCtx(session(rolRow({ scope: "pais", pais: "Venezuela" })));
    expect(ctx.scope).toBe("pais");
    expect(ctx.paisScope).toBe("Venezuela");
    expect(ctx.rol).toBe(ctx.profile.rol);
  });

  it("global → paisScope '__all__'", () => {
    const ctx = toSessionCtx(session(rolRow({ scope: "global", pais: null })));
    expect(ctx.scope).toBe("global");
    expect(ctx.paisScope).toBe("__all__");
  });

  it("admin → paisScope '__all__'", () => {
    const ctx = toSessionCtx(session(rolRow({ scope: "admin", pais: null })));
    expect(ctx.scope).toBe("admin");
    expect(ctx.paisScope).toBe("__all__");
  });
});

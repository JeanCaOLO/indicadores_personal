// =============================================================================
// test/rbac.test.ts
//
// Tests unitarios de `lib/auth/rbac.ts` (tarea 10.1). RBAC es PURO (sin I/O),
// así que se verifica directamente el comportamiento de las 3 funciones para
// los 3 scopes (global, pais, admin).
//
// _Validates: Requirements 12.4, 13.5_
// =============================================================================

import { describe, expect, it } from "vitest";
import type { Rol } from "../core/types";
import {
  canManageUsers,
  canSeeData,
  resolvePaisScope,
} from "../lib/auth/rbac";

/** Helper: construye un `Rol` mínimo para los tests. */
function rol(scope: Rol["scope"], pais: string | null): Rol {
  return { id: `r_${scope}`, nombre: scope, scope, pais };
}

describe("resolvePaisScope", () => {
  it("global → '__all__'", () => {
    expect(resolvePaisScope(rol("global", null))).toBe("__all__");
    // Un rol global con país igual se trata como '__all__'.
    expect(resolvePaisScope(rol("global", "Costa Rica"))).toBe("__all__");
  });

  it("admin → '__all__' (no ve data, pero el filtro de país es '__all__')", () => {
    expect(resolvePaisScope(rol("admin", null))).toBe("__all__");
    expect(resolvePaisScope(rol("admin", "Venezuela"))).toBe("__all__");
  });

  it("pais → el país del rol", () => {
    expect(resolvePaisScope(rol("pais", "Costa Rica"))).toBe("Costa Rica");
    expect(resolvePaisScope(rol("pais", "Venezuela"))).toBe("Venezuela");
  });

  it("pais sin país definido → '__all__' (salvaguarda defensiva)", () => {
    expect(resolvePaisScope(rol("pais", null))).toBe("__all__");
    expect(resolvePaisScope(rol("pais", ""))).toBe("__all__");
    expect(resolvePaisScope(rol("pais", "   "))).toBe("__all__");
  });

  it("acepta un objeto parcial { scope, pais } (ScopeLike)", () => {
    expect(resolvePaisScope({ scope: "pais", pais: "Costa Rica" })).toBe("Costa Rica");
    expect(resolvePaisScope({ scope: "global", pais: null })).toBe("__all__");
  });
});

describe("canManageUsers", () => {
  it("true para admin y global", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("global")).toBe(true);
  });

  it("false para pais", () => {
    expect(canManageUsers("pais")).toBe(false);
  });
});

describe("canSeeData", () => {
  it("true para global y pais", () => {
    expect(canSeeData("global")).toBe(true);
    expect(canSeeData("pais")).toBe(true);
  });

  it("false para admin (admin no ve data)", () => {
    expect(canSeeData("admin")).toBe(false);
  });
});

// =============================================================================
// lib/auth/rbac.ts
//
// RBAC (Role-Based Access Control) PURO — sin I/O, sin dependencias de red ni
// de Next. Reglas de autorización derivadas del `scope` del rol del usuario.
//
// Portado del comportamiento del sistema actual (`out/index.html`), donde el
// rol del usuario define:
//   - scope 'global' → ve la data de TODOS los países (ROLE = "__all__").
//   - scope 'pais'   → ve SOLO la data de su país (ROLE = rol.pais).
//   - scope 'admin'  → NO ve data, pero gestiona usuarios/roles. En el sistema
//                      actual, para el filtro de país igual se setea
//                      ROLE = "__all__" aunque la data no se muestre.
//
// Estas funciones son puras y deterministas: ideales para tests unitarios.
//
// _Requirements: 12.4, 13.5_
// =============================================================================

import type { Pais, PaisScope, Rol, Scope } from "../../core/types";

// Re-export del `Scope` de core/types para que los consumidores de RBAC puedan
// importarlo desde un único lugar (lib/auth).
export type { Scope } from "../../core/types";

/**
 * Forma mínima necesaria para resolver el scope de país: basta con `scope` y
 * `pais`. Tanto un `Rol` completo como un objeto parcial `{ scope, pais }`
 * satisfacen esta forma, así que `resolvePaisScope` acepta ambos.
 */
export interface ScopeLike {
  scope: Scope;
  pais: string | null;
}

/**
 * Resuelve el filtro de país (`PaisScope`) que corresponde a un rol.
 *
 * Reglas (idénticas al sistema actual):
 *   - scope 'global' → "__all__"  (ve todos los países).
 *   - scope 'admin'  → "__all__"  (NO ve data, pero para el filtro de país se
 *                      trata como "__all__", igual que el sistema actual que
 *                      setea ROLE="__all__" para admin aunque no muestre data).
 *   - scope 'pais'   → `rol.pais` (su país). Si `pais` fuese null/vacío por
 *                      datos inconsistentes, se degrada a "__all__" como
 *                      salvaguarda (no debería ocurrir: un rol 'pais' siempre
 *                      debe tener país).
 *
 * @param rol Rol completo (o cualquier objeto con `{ scope, pais }`).
 * @returns El `PaisScope`: "__all__" o el país concreto.
 */
export function resolvePaisScope(rol: Rol | ScopeLike): PaisScope {
  if (rol.scope === "global" || rol.scope === "admin") {
    return "__all__";
  }
  // scope === 'pais'
  const pais = rol.pais;
  if (pais && pais.trim() !== "") {
    return pais as Pais;
  }
  // Salvaguarda defensiva: rol de país sin país definido → sin filtro.
  return "__all__";
}

/**
 * ¿Puede el scope gestionar usuarios y roles?
 * Solo los scopes 'admin' y 'global' pueden administrar usuarios (Req 14.2).
 *
 * @param scope Scope del rol del usuario.
 */
export function canManageUsers(scope: Scope): boolean {
  return scope === "admin" || scope === "global";
}

/**
 * ¿Puede el scope VER data de indicadores?
 * Los scopes 'global' (todos los países) y 'pais' (su país) ven data; el scope
 * 'admin' NO ve data (solo gestiona usuarios), igual que el sistema actual.
 *
 * @param scope Scope del rol del usuario.
 */
export function canSeeData(scope: Scope): boolean {
  return scope === "global" || scope === "pais";
}

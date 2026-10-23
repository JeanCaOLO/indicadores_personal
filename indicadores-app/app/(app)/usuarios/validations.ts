// =============================================================================
// app/(app)/usuarios/validations.ts
//
// Helpers PUROS y constantes compartidos por la Pantalla Usuarios. Viven en un
// módulo SEPARADO del archivo de Server Actions (./actions.ts) porque un módulo
// marcado con "use server" solo puede exportar funciones async (Server
// Actions); no puede exportar constantes, tipos ni funciones síncronas.
//
// Este módulo NO lleva "use server": es código normal que se puede importar
// tanto desde el servidor (actions.ts, page.tsx) como desde client components
// (para la validación liviana de UX y los ids de roles base).
//
// _Requirements: 14.3, 14.5_
// =============================================================================

import type { Scope } from "../../../core/types";

/** Resultado uniforme de las acciones (para que la UI muestre éxito/error). */
export interface ActionResult {
  ok: boolean;
  /** Mensaje para mostrar en la UI (toast/banner). */
  message: string;
}

/** Longitud mínima de contraseña, igual que el Sistema_Actual (6+). */
export const MIN_PASSWORD_LENGTH = 6;

/** Roles base que no se pueden eliminar (igual que el Sistema_Actual). */
export const BASE_ROLE_IDS = ["global", "admin", "costa_rica", "venezuela"];

/** Normaliza un email para comparación (trim + lowercase). */
export function normalizeEmail(email: string): string {
  return String(email).trim().toLowerCase();
}

/**
 * Valida un correo: no vacío y con un formato básico `algo@algo.algo`. Es la
 * misma exigencia que el Sistema_Actual (correo requerido) endurecida con un
 * chequeo de formato en el servidor.
 */
export function isValidEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Valida la contraseña: al menos MIN_PASSWORD_LENGTH caracteres. */
export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Normaliza un scope de rol a uno válido ('global'|'pais'|'admin'); cualquier
 * otro valor se degrada a 'pais' (el más restrictivo), por seguridad.
 */
export function normalizeScope(scope: string): Scope {
  return scope === "global" || scope === "admin" || scope === "pais"
    ? scope
    : "pais";
}

/**
 * Deriva un id slug a partir del nombre del rol, igual que el Sistema_Actual:
 * minúsculas, sin diacríticos, no alfanumérico → "_", sin "_" en los bordes.
 */
export function slugifyRoleId(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

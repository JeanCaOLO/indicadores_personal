// =============================================================================
// lib/auth/logout.ts
//
// Handler de cierre de sesión reutilizable para el navegador. Encapsula la
// llamada a Supabase Auth `signOut()` con el browser client, de modo que la
// UI (p. ej. el botón "Salir" del header, cuya implementación visual es la
// tarea 12.3) solo tenga que invocar una función.
//
// `signOut()` solo INVALIDA la sesión local (no navega). La redirección a
// `/login` la decide el componente de UI (ver components/auth/LogoutButton),
// que usa el router de Next para no acoplar esta lógica a `window`. A partir
// del logout, el middleware (middleware.ts) impide el acceso a las páginas de
// datos hasta volver a autenticarse (Req 12.5).
//
// "use client": usa el browser client. Importar solo desde código de cliente.
//
// _Requirements: 12.5_
// =============================================================================

"use client";

import { createClient } from "../supabase/client";

/**
 * Cierra la sesión del usuario en el navegador (Supabase Auth `signOut()`).
 *
 * No navega: devuelve el control al llamador para que decida la redirección
 * (típicamente a `/login`). Los errores se ignoran de forma segura: aun si
 * `signOut` fallara, el guard server-side (`requireAuth`) seguirá protegiendo
 * y el llamador puede redirigir igualmente.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    // Ignorado: el llamador redirige a /login igualmente.
  }
}

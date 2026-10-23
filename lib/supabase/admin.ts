// =============================================================================
// lib/supabase/admin.ts
//
// Cliente Supabase con la clave `service_role`.
//
// ⚠️  SOLO SERVIDOR. Este cliente OMITE Row Level Security (RLS): tiene acceso
//     total a todas las filas de todos los países. NUNCA debe importarse ni
//     ejecutarse en código de cliente (componentes "use client", el navegador,
//     etc.). Úsalo únicamente en código server-side: scripts de migración,
//     tareas administrativas, route handlers del servidor.
//
// La clave `SUPABASE_SERVICE_ROLE_KEY` es un secreto y jamás se expone al
// cliente (no lleva prefijo NEXT_PUBLIC_). Ver `.env.local.example`.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Crea un cliente Supabase con privilegios `service_role` (omite RLS).
 *
 * Lee las variables de entorno:
 *  - `NEXT_PUBLIC_SUPABASE_URL`   → URL del proyecto Supabase.
 *  - `SUPABASE_SERVICE_ROLE_KEY`  → clave secreta service_role (solo servidor).
 *
 * Lanza un error claro si falta alguna variable.
 *
 * La sesión no se persiste ni se auto-refresca: este cliente es para uso
 * efímero en procesos server-side, no para sesiones de usuario.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL (requerida por createAdminClient).",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY (requerida por createAdminClient). " +
        "Es un secreto de servidor; nunca la expongas al cliente.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

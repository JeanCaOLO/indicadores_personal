// =============================================================================
// lib/supabase/client.ts
//
// Cliente Supabase para el NAVEGADOR (browser), con la clave pública `anon`.
//
// Usable desde componentes de cliente ("use client") y cualquier código que
// corra en el navegador. Respeta Row Level Security (RLS): opera con la sesión
// del usuario (anon + JWT en cookies/localStorage gestionado por @supabase/ssr),
// lo que es la base del aislamiento por país (Req 13.1).
//
// NO usa la clave `service_role` (esa vive solo en lib/supabase/admin.ts y
// jamás se expone al cliente).
// =============================================================================

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../supabase/types";

/**
 * Crea un cliente Supabase para el navegador, tipado con el esquema `Database`.
 *
 * Lee las variables de entorno públicas:
 *  - `NEXT_PUBLIC_SUPABASE_URL`       → URL del proyecto Supabase.
 *  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`  → clave pública anon (segura en el cliente).
 *
 * Lanza un error claro si falta alguna variable.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL (requerida por createClient).",
    );
  }
  if (!anonKey) {
    throw new Error(
      "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_ANON_KEY (requerida por createClient).",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}

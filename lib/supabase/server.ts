// =============================================================================
// lib/supabase/server.ts
//
// Cliente Supabase para el SERVIDOR (SSR), con la clave pública `anon` y la
// sesión del usuario leída/escrita vía cookies de Next.js.
//
// Respeta Row Level Security (RLS): al reenviar las cookies de sesión del
// usuario, Supabase ejecuta las queries con el JWT del usuario, lo que es la
// base del aislamiento por país (Req 13.1).
//
// Pensado para Server Components, Route Handlers y Server Actions del App
// Router de Next.js 16, donde `cookies()` de `next/headers` es asíncrono.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../../supabase/types";

/**
 * Crea un cliente Supabase para el servidor, tipado con el esquema `Database`.
 *
 * Lee las variables de entorno públicas:
 *  - `NEXT_PUBLIC_SUPABASE_URL`       → URL del proyecto Supabase.
 *  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`  → clave pública anon.
 *
 * Usa el patrón recomendado de @supabase/ssr para App Router: `getAll`/`setAll`
 * sobre el store de cookies de Next. El `setAll` va envuelto en try/catch porque
 * en un Server Component no siempre es posible escribir cookies (solo en Route
 * Handlers / Server Actions); en ese caso el refresco de sesión lo realiza el
 * middleware y el error se ignora de forma segura.
 *
 * Lanza un error claro si falta alguna variable de entorno.
 */
export async function createClient() {
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

  // En Next.js 15+/16 `cookies()` es asíncrono.
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `setAll` fue llamado desde un Server Component. Se puede ignorar
          // si hay un middleware que refresca la sesión del usuario.
        }
      },
    },
  });
}

// =============================================================================
// lib/supabase/middleware.ts
//
// Helper `updateSession` para el middleware de Next.js (App Router), siguiendo
// el patrón oficial de @supabase/ssr. Refresca la sesión del usuario en cada
// request (renueva el token si expiró) y decide las redirecciones de acceso:
//
//   - Si NO hay usuario y la ruta NO es pública → redirige a /login.
//   - Si HAY usuario y está en /login            → redirige a /dashboard.
//
// ⚠️ EDGE RUNTIME: este módulo corre en el middleware (edge), por lo que NO
//    puede usar `next/headers` ni el server client de SSR. Crea su propio
//    `createServerClient` leyendo/escribiendo cookies sobre el par
//    NextRequest/NextResponse, como exige el patrón de @supabase/ssr.
//
// IMPORTANTE (patrón oficial): el objeto `supabaseResponse` que se devuelve
// NO debe reemplazarse por otro `NextResponse` arbitrario sin copiar antes sus
// cookies; de lo contrario la sesión del navegador y del servidor se
// desincroniza. Cuando hace falta redirigir, se copian las cookies del
// response original al response de redirección.
//
// _Requirements: 12.1, 12.2, 12.4, 12.5_
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Rutas públicas accesibles SIN sesión. `/login` es la pantalla de acceso; el
 * resto son recursos de autenticación/callback que pudieran añadirse luego.
 */
const PUBLIC_PATHS = ["/login", "/auth"];

/** ¿La ruta es pública (no requiere sesión)? */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refresca la sesión y aplica las redirecciones de acceso.
 *
 * @param request El `NextRequest` entrante.
 * @returns El `NextResponse` con las cookies de sesión actualizadas (o una
 *          redirección que preserva esas cookies).
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si faltan las variables de entorno (p. ej. en build time o entornos sin
  // configurar), NO se puede validar la sesión: se deja pasar la request tal
  // cual para no romper el render. El guard server-side (`requireAuth`) seguirá
  // protegiendo las páginas de datos.
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANTE: no ejecutar lógica entre crear el cliente y getUser(); getUser()
  // revalida el token contra Supabase y refresca la sesión si corresponde.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Sin usuario y ruta protegida → a /login.
  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  // Con usuario y en /login → al dashboard (ya está autenticado).
  if (user && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  return supabaseResponse;
}

/**
 * Copia las cookies de un response (el que trae la sesión refrescada) a otro
 * (la redirección), para no desincronizar la sesión. Devuelve el destino.
 */
function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie);
  });
  return to;
}

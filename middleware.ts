// =============================================================================
// middleware.ts (RAÍZ del proyecto)
//
// Next.js (App Router) SOLO detecta el middleware en la raíz del proyecto
// (`indicadores-app/middleware.ts`) o en `src/middleware.ts` — NUNCA dentro de
// `app/`. Por eso vive acá y no en `app/middleware.ts` (el árbol del diseño lo
// listaba bajo `app/` de forma esquemática; la convención real de Next lo ubica
// en la raíz).
//
// Delega en `updateSession` (lib/supabase/middleware) el patrón oficial de
// @supabase/ssr: refresca la sesión en cada request y redirige a /login cuando
// no hay sesión en rutas protegidas (Req 12.1, 12.4), o a /dashboard si un
// usuario autenticado abre /login.
//
// _Requirements: 12.1, 12.2, 12.4, 12.5_
// =============================================================================

import type { NextRequest } from "next/server";

import { updateSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Ejecuta el middleware en todas las rutas EXCEPTO:
     *  - _next/static  (assets estáticos del build)
     *  - _next/image   (imágenes optimizadas)
     *  - favicon.ico
     *  - archivos estáticos comunes (imágenes, fuentes) por extensión
     *
     * Así se refresca la sesión en las páginas sin malgastar el middleware en
     * recursos estáticos.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};

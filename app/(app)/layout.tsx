// =============================================================================
// app/(app)/layout.tsx
//
// Layout base del GRUPO PROTEGIDO (tarea 12.3). Es un SERVER COMPONENT que
// envuelve las 5 vistas/rutas del grupo (app): dashboard, administrar,
// corporativa, comparativa, usuarios.
//
// Responsabilidades:
//   1. GUARD DE SESIÓN: `const ctx = await requireAuth()` (lib/auth/session).
//      Si no hay sesión, requireAuth redirige a /login (no retorna). Si hay,
//      ctx = { user, profile, rol, scope, paisScope }.
//   2. RENDER del Header (logo + acciones + chip de usuario con nombre+rol y
//      botón Salir), la FilterBar y el PillNav, y debajo {children}.
//
// PARIDAD VISUAL con out/index.html:
//   <header class="app">…</header>
//   <div class="stickytop">
//     <div class="filters" id="filterBar">…</div>
//     <div class="pillnav" id="pillarNav">…</div>
//   </div>
//   <main> {children} </main>
//
// NAVEGACIÓN POR RUTAS: el Sistema_Actual era una SPA con TABs (dash, admin,
// pres, usuarios) y un VIEW (mes/acum/comp). Acá cada vista es una RUTA; el
// PillNav usa <Link> por ruta y resuelve el pill activo con usePathname (client
// component). Las 5 vistas corresponden a: Dashboard, Administrar, Corporativa,
// Comparativa, Usuarios.
//
// SCOPE (portado de `applySessionAccess`, Req 5.5):
//   - admin  → NO ve data: no se renderiza la FilterBar y el PillNav solo
//              muestra "Usuarios" (admin va directo a usuarios).
//   - global → ve todo (todas las vistas, País libre).
//   - pais   → ve las vistas de data; el País queda fijado/deshabilitado en la
//              FilterBar (FilterBar aplica Req 5.5 con ctx.paisScope).
//
// _Requirements: 16.3, 5.5_
// =============================================================================

import type { ReactNode } from "react";

import FilterBar from "../../components/FilterBar";
import Header from "../../components/Header";
import PillNav, { type PillItem } from "../../components/PillNav";
import { requireAuth } from "../../lib/auth/session";

// -----------------------------------------------------------------------------
// Cache Components (Next 16): este grupo es 100% autenticado — el layout lee
// cookies via requireAuth() en cada request, asi que NO puede prerenderizarse.
// `instant = false` indica a Next que la navegacion a estas rutas BLOQUEA en el
// servidor (render dinamico), que es justo lo que necesitamos. Cubre a todas
// las rutas hijas del grupo (dashboard, corporativa, comparativa, administrar,
// usuarios). Ver: nextjs.org/docs/app/guides/authentication-with-cache-components
export const instant = false;

// Pills de las vistas que consumen data (se ocultan para scope admin).
const DATA_PILLS: PillItem[] = [
  { href: "/dashboard", label: "Dashboard", title: "Dashboard Operativo" },
  { href: "/corporativa", label: "Corporativa", title: "Vista Corporativa" },
  { href: "/comparativa", label: "Comparativa", title: "Vista Comparativa" },
  { href: "/administrar", label: "Administrar", title: "Administrar datos" },
];

// Pill de gestión de usuarios (visible para admin y global).
const USUARIOS_PILL: PillItem = {
  href: "/usuarios",
  label: "Usuarios",
  title: "Gestión de usuarios y roles",
};

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // 1. Guard de sesión (redirige a /login si no hay sesión).
  const ctx = await requireAuth();

  const esAdmin = ctx.scope === "admin";
  const puedeUsuarios = ctx.scope === "admin" || ctx.scope === "global";

  // Pills según scope: admin solo ve Usuarios; el resto ve las vistas de data
  // y, si corresponde, también Usuarios (global).
  const pills: PillItem[] = esAdmin
    ? [USUARIOS_PILL]
    : puedeUsuarios
      ? [...DATA_PILLS, USUARIOS_PILL]
      : DATA_PILLS;

  // Nombre del chip: nombre del perfil o, si falta, el email.
  const nombre = ctx.profile.nombre || ctx.profile.email || ctx.user.email || "";

  return (
    <>
      <Header
        scope={ctx.scope}
        paisScope={ctx.paisScope}
        nombre={nombre}
        rolNombre={ctx.rol.nombre}
      />

      <div className="stickytop">
        {/* La FilterBar solo tiene sentido donde hay data (no para admin). */}
        {!esAdmin && <FilterBar paisScope={ctx.paisScope} />}
        <PillNav items={pills} />
      </div>

      <main>{children}</main>
    </>
  );
}

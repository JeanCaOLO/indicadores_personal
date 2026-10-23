// =============================================================================
// components/Header.tsx
//
// Encabezado de la app (tarea 12.3). Paridad visual 1:1 con el <header class="app">
// del Sistema_Actual (out/index.html):
//
//   <header class="app">
//     <div class="app-inner">
//       <div class="logo"> <span class="mark">…</span> <span class="divider"></span>
//                          <span class="txt"><small>…</small><b>Indicadores</b></span> </div>
//       <div class="hactions"> …botones .hbtn… <span class="userchip">…</span> Salir </div>
//     </div>
//   </header>
//
// Es un SERVER COMPONENT: recibe el scope/perfil ya resueltos por el layout
// (requireAuth) y renderiza el markup estático. Las únicas partes interactivas
// son client components embebidos: los links de navegación (Vista Corporativa,
// Administrar, Usuarios) usan next/link, y Salir usa <LogoutButton>.
//
// LOGO: el sistema actual incrusta un <img> base64 gigante. Para no pegar ese
// binario, se usa el placeholder de texto con las mismas clases (.logo .mark
// con "OLO" + .divider + .txt). El CSS de .logo ya está portado (tarea 12.1).
//
// BOTONES DE ACCIÓN:
//   · Excel mes/año + PDF → CABLEADOS (tarea 18.1) vía <HeaderActions> (client
//     component). Solo se muestran en /dashboard (paridad: el sistema actual
//     mostraba xlsMesBtn/xlsAnioBtn/printBtn del dash). En /corporativa el PDF
//     lo provee el botón propio de esa vista (downloadPDFCorporativa).
//   · Vista Corporativa / Administrar / Usuarios → <Link> reales.
//   · Salir → <LogoutButton> funcional (tarea 10/12.5).
//   · Sincronizar → placeholder visual (fuera del alcance de 18.1).
//
// VISIBILIDAD POR SCOPE (portado de `applySessionAccess` del sistema actual):
//   - admin  → NO ve botones de dashboard/data (Excel, PDF, Corporativa,
//              Administrar, Sincronizar); solo ve Usuarios + Salir + chip.
//   - global → ve todo, incluido Usuarios.
//   - pais   → ve los botones de data, pero NO el botón Usuarios.
//
// _Requirements: 16.3, 5.5_
// =============================================================================

import Link from "next/link";

import type { PaisScope, Scope } from "../core/types";
import LogoutButton from "./auth/LogoutButton";
import HeaderActions from "./HeaderActions";

export interface HeaderProps {
  /** Scope del usuario (global/pais/admin), resuelto por requireAuth. */
  scope: Scope;
  /** Filtro de país del usuario (RBAC): "__all__" o un país (scope 'pais'). */
  paisScope: PaisScope;
  /** Nombre a mostrar en el chip (cae a email si no hay nombre). */
  nombre: string;
  /** Nombre del rol a mostrar en el badge del chip. */
  rolNombre: string;
}

export function Header({ scope, paisScope, nombre, rolNombre }: HeaderProps) {
  const esAdmin = scope === "admin";
  // Botón Usuarios: solo admin o global (igual que el sistema actual).
  const puedeUsuarios = scope === "admin" || scope === "global";
  // Los botones de data se ocultan para admin (no ve data).
  const verData = !esAdmin;

  return (
    <header className="app">
      <div className="app-inner">
        <div className="logo">
          {/* Placeholder de texto en lugar del <img> base64 del sistema actual. */}
          <span className="mark">
            <b
              style={{
                fontFamily: "var(--font-space-grotesk)",
                fontSize: "28px",
                fontWeight: 700,
                color: "var(--teal-d)",
                letterSpacing: "-.02em",
              }}
            >
              OLO
            </b>
          </span>
          <span className="divider"></span>
          <span className="txt">
            <small>Gestión Integral de Talento</small>
            <b>Indicadores</b>
          </span>
        </div>

        <div className="hactions">
          {verData && (
            <>
              {/* Excel mes/año + PDF operativo (cableado 18.1). El propio
                  HeaderActions decide su visibilidad por vista (solo /dashboard). */}
              <HeaderActions paisScope={paisScope} />
              <Link className="hbtn" href="/corporativa">
                Vista Corporativa
              </Link>
              <button
                className="hbtn"
                type="button"
                title="Sincronizar datos con la nube (Supabase)"
              >
                ☁ Sincronizar
              </button>
            </>
          )}

          {puedeUsuarios && (
            <Link
              className="hbtn"
              href="/usuarios"
              title="Gestión de usuarios y roles"
            >
              👥 Usuarios
            </Link>
          )}

          {verData && (
            <Link className="hbtn solid" href="/administrar">
              Administrar datos
            </Link>
          )}

          <span className="userchip">
            <span>{nombre}</span>
            <span className="badge">{rolNombre}</span>
          </span>

          <LogoutButton className="hbtn" />
        </div>
      </div>
    </header>
  );
}

export default Header;

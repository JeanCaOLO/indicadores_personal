// =============================================================================
// components/auth/LogoutButton.tsx
//
// Botón de "Cerrar sesión" reutilizable (client component). Llama al handler
// `signOut` (lib/auth/logout), que cierra la sesión en Supabase y redirige a
// /login. El diseño visual fino del header es la tarea 12.3; acá se provee el
// componente funcional que ese header podrá reutilizar.
//
// Acepta `className` y `children` para que el header lo integre con sus propias
// clases ("hbtn") sin reimplementar la lógica de logout.
//
// _Requirements: 12.5_
// =============================================================================

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "../../lib/auth/logout";

export interface LogoutButtonProps {
  /** Clases CSS para integrarlo con el estilo del header (p. ej. "hbtn"). */
  className?: string;
  /** Texto/el contenido del botón. Por defecto "Salir". */
  children?: React.ReactNode;
}

export function LogoutButton({ className, children }: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await signOut();
    // Navega a /login y fuerza la relectura de la sesión (ahora cerrada) en el
    // middleware y los Server Components. No reseteamos `pending`: la
    // navegación desmonta el componente.
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={pending}
      title="Cerrar sesión"
    >
      {children ?? (pending ? "Saliendo…" : "Salir")}
    </button>
  );
}

export default LogoutButton;

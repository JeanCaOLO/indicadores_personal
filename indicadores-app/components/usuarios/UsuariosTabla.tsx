// =============================================================================
// components/usuarios/UsuariosTabla.tsx
//
// Tabla de usuarios registrados (client component). Replica el markup/clases
// de `#uBody` de renderUsuarios: por fila un selector de rol editable
// (`.uRolEdit`), un checkbox de activo (`.uActEdit`), un botón Guardar
// (`.mini`) y un botón Eliminar (`.row-del`). Invoca las Server Actions
// `actualizarUsuario` y `eliminarUsuario`.
//
// _Requirements: 14.1, 14.2_
// =============================================================================

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Rol } from "../../core/types";
import { actualizarUsuario, eliminarUsuario } from "../../app/(app)/usuarios/actions";

/** Forma mínima de un usuario para la tabla. */
export interface UsuarioRow {
  user_id: string;
  nombre: string;
  email: string;
  rol_id: string;
  activo: boolean;
}

export interface UsuariosTablaProps {
  usuarios: UsuarioRow[];
  roles: Rol[];
}

function Fila({ u, roles }: { u: UsuarioRow; roles: Rol[] }) {
  const router = useRouter();
  const [rolId, setRolId] = useState(u.rol_id);
  const [activo, setActivo] = useState(u.activo);
  const [pending, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      const res = await actualizarUsuario(u.user_id, { rol_id: rolId, activo });
      if (res.ok) router.refresh();
      else alert(res.message);
    });
  }

  function eliminar() {
    if (!confirm("¿Eliminar este usuario?")) return;
    startTransition(async () => {
      const res = await eliminarUsuario(u.user_id);
      if (res.ok) router.refresh();
      else alert(res.message);
    });
  }

  return (
    <tr data-id={u.user_id}>
      <td>{u.nombre || "—"}</td>
      <td>{u.email}</td>
      <td>
        <select
          className="uRolEdit"
          style={{ padding: "6px 8px" }}
          value={rolId}
          onChange={(e) => setRolId(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </td>
      <td className="num">
        <input
          type="checkbox"
          className="uActEdit"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
        />
      </td>
      <td style={{ textAlign: "right" }}>
        <button className="mini uSaveBtn" onClick={guardar} disabled={pending}>
          Guardar
        </button>{" "}
        <button
          className="row-del uDelBtn"
          title="Eliminar"
          onClick={eliminar}
          disabled={pending}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

export default function UsuariosTabla({ usuarios, roles }: UsuariosTablaProps) {
  return (
    <div className="card adm-card">
      <div className="ch">
        <h3>Usuarios registrados</h3>
        <span className="hint">{usuarios.length} usuario(s)</span>
      </div>
      <div className="cb">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="uBody">
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Sin usuarios aún
                </td>
              </tr>
            ) : (
              usuarios.map((u) => <Fila key={u.user_id} u={u} roles={roles} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

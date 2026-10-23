// =============================================================================
// components/usuarios/RolesSeccion.tsx
//
// Sección de Roles (client component). Replica el markup/clases de `#rForm` y
// `#rBody` de renderUsuarios: formulario de alta de rol (`.usr-form`, selector
// de alcance con el campo País que se muestra/oculta según el scope) y la tabla
// de roles con botón de eliminación (`.row-del`) salvo para los roles base
// (que muestran "base"). Invoca las Server Actions `crearRol` y `eliminarRol`.
//
// _Requirements: 14.3_
// =============================================================================

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Rol } from "../../core/types";
import { crearRol, eliminarRol } from "../../app/(app)/usuarios/actions";
import { BASE_ROLE_IDS } from "../../app/(app)/usuarios/validations";

export interface RolesSeccionProps {
  roles: Rol[];
}

function scopeName(sc: string): string {
  return sc === "global"
    ? "Global (toda la data)"
    : sc === "admin"
      ? "Admin (solo usuarios)"
      : "País";
}

export default function RolesSeccion({ roles }: RolesSeccionProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [scope, setScope] = useState("pais");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const nombre = String(fd.get("nombre") ?? "").trim();
    const pais = String(fd.get("pais") ?? "").trim();
    if (!nombre) {
      setMsg("Nombre del rol requerido");
      return;
    }
    if (scope === "pais" && !pais) {
      setMsg("Indicá el país");
      return;
    }
    startTransition(async () => {
      const res = await crearRol(fd);
      setMsg(res.ok ? "✓ Rol agregado" : res.message);
      if (res.ok) {
        form.reset();
        setScope("pais");
        router.refresh();
      }
    });
  }

  function eliminar(id: string) {
    if (
      !confirm(
        "¿Eliminar este rol? Los usuarios con este rol quedarán sin acceso válido.",
      )
    )
      return;
    startTransition(async () => {
      const res = await eliminarRol(id);
      if (res.ok) router.refresh();
      else alert(res.message);
    });
  }

  return (
    <div className="card adm-card">
      <div className="ch">
        <h3>🏷️ Roles</h3>
        <span className="hint">Agregá roles por país o accesos especiales</span>
      </div>
      <div className="cb" style={{ padding: "16px 20px" }}>
        <form ref={formRef} className="usr-form" onSubmit={onSubmit}>
          <div>
            <label className="fld">Nombre del rol</label>
            <input type="text" name="nombre" placeholder="Ej: Colombia" />
          </div>
          <div>
            <label className="fld">Alcance</label>
            <select
              name="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="pais">País (ve solo su país)</option>
              <option value="global">Global (ve todo)</option>
              <option value="admin">Admin (solo usuarios)</option>
            </select>
          </div>
          <div style={{ display: scope === "pais" ? undefined : "none" }}>
            <label className="fld">País</label>
            <input type="text" name="pais" placeholder="Ej: Colombia" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <button type="submit" className="mini save" disabled={pending}>
              {pending ? "Agregando…" : "Agregar rol"}
            </button>
            {msg && (
              <span className="hint" style={{ marginLeft: 10 }}>
                {msg}
              </span>
            )}
          </div>
        </form>
        <div className="dc-tbl" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Rol</th>
                <th>Alcance</th>
                <th>País</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="rBody">
              {roles.map((r) => (
                <tr key={r.id} data-id={r.id}>
                  <td>{r.nombre}</td>
                  <td>{scopeName(r.scope)}</td>
                  <td>{r.pais || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {BASE_ROLE_IDS.includes(r.id) ? (
                      <span className="hint">base</span>
                    ) : (
                      <button
                        className="row-del rDelBtn"
                        title="Eliminar"
                        onClick={() => eliminar(r.id)}
                        disabled={pending}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

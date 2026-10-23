// =============================================================================
// components/usuarios/CrearUsuarioForm.tsx
//
// Formulario de alta de usuario (client component). Replica el markup/clases
// de `#uForm` de renderUsuarios (`.usr-form` en grid, labels `.fld`, inputs,
// botón `.mini.save`). Invoca la Server Action `crearUsuario(formData)` y
// muestra el resultado con un toast simple.
//
// La validación dura (correo + contraseña 6+) vive en la Server Action
// (Req 14.5); acá se hace un chequeo liviano de UX idéntico al Sistema_Actual
// ("Correo y contraseña (6+) requeridos") antes de enviar.
//
// _Requirements: 14.1, 14.2, 14.5_
// =============================================================================

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Rol } from "../../core/types";
import { crearUsuario } from "../../app/(app)/usuarios/actions";

export interface CrearUsuarioFormProps {
  roles: Rol[];
}

export default function CrearUsuarioForm({ roles }: CrearUsuarioFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    const pass = String(fd.get("password") ?? "");
    // Chequeo liviano de UX (la validación autoritativa está en el servidor).
    if (!email || pass.length < 6) {
      setMsg("Correo y contraseña (6+) requeridos");
      return;
    }
    startTransition(async () => {
      const res = await crearUsuario(fd);
      setMsg(res.ok ? "✓ Usuario creado" : res.message);
      if (res.ok) {
        form.reset();
        router.refresh();
      }
    });
  }

  const rolOpts = roles.map((r) => (
    <option key={r.id} value={r.id}>
      {r.nombre}
    </option>
  ));

  return (
    <div className="card adm-card">
      <div className="ch">
        <h3>➕ Registrar usuario</h3>
      </div>
      <div className="cb" style={{ padding: "16px 20px" }}>
        <form ref={formRef} className="usr-form" onSubmit={onSubmit}>
          <div>
            <label className="fld">Nombre</label>
            <input type="text" name="nombre" placeholder="Nombre completo" />
          </div>
          <div>
            <label className="fld">Correo</label>
            <input type="text" name="email" placeholder="correo@olo.com" />
          </div>
          <div>
            <label className="fld">Contraseña</label>
            <input type="password" name="password" placeholder="mínimo 6 caracteres" />
          </div>
          <div>
            <label className="fld">Rol</label>
            <select name="rol_id" defaultValue={roles[0]?.id ?? ""}>
              {rolOpts}
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <button type="submit" className="mini save" disabled={pending}>
              {pending ? "Creando…" : "Crear usuario"}
            </button>
            {msg && (
              <span className="hint" style={{ marginLeft: 10 }}>
                {msg}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

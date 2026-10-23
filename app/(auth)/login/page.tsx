// =============================================================================
// app/(auth)/login/page.tsx
//
// Pantalla de login con Supabase Auth (email/password), reemplazando el login
// casero PBKDF2 del Sistema_Actual (Req 12.1). Es un client component: usa el
// browser client (lib/supabase/client) y maneja el formulario en el navegador.
//
// Comportamiento (portado del flujo de auth de out/index.html):
//   - Credenciales válidas   → sesión iniciada; redirige a /dashboard (Req 12.2).
//   - Credenciales inválidas → mensaje de error claro, sin navegar (Req 12.3).
//   - Estado de carga        → botón deshabilitado con texto "Entrando…".
//
// El acceso sin sesión a las páginas de datos lo bloquea el middleware + el
// guard server-side `requireAuth` (Req 12.4). El logout vive en
// components/auth/LogoutButton + lib/auth/logout (Req 12.5).
//
// El diseño fino es la tarea 12/16; acá se usa un module CSS que reproduce el
// scrim centrado con logo del Sistema_Actual, sin depender de globals.css
// (tarea 12.1).
//
// _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
// =============================================================================

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createClient } from "../../../lib/supabase/client";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setError(null);

    const correo = email.trim();
    if (correo === "" || password === "") {
      setError("Ingresá tu correo y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: correo,
        password,
      });

      if (authError) {
        // Mensaje claro y genérico (no revela si el correo existe), igual que el
        // Sistema_Actual, salvo cuando el correo no está confirmado.
        setError(
          /confirm/i.test(authError.message)
            ? "Tu correo todavía no está confirmado."
            : "Correo o contraseña incorrectos.",
        );
        setLoading(false);
        return;
      }

      // Credenciales válidas → al dashboard. `refresh()` fuerza al middleware y
      // a los Server Components a releer la sesión recién creada.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo iniciar sesión. Intentá de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.scrim}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>OLO</span>
          <span className={styles.brandDivider} />
          <span>
            <small>Gestión Integral de Talento</small>
            <b>Indicadores</b>
          </span>
        </div>

        <h1 className={styles.title}>Iniciar sesión</h1>
        <p className={styles.sub}>Ingresá con tu correo y contraseña.</p>

        <form onSubmit={handleSubmit} autoComplete="on" noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="correo@olo.com"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>

          <div
            className={`${styles.msg} ${error ? styles.msgErr : ""}`}
            role={error ? "alert" : undefined}
            aria-live="polite"
          >
            {error ?? ""}
          </div>
        </form>
      </div>
    </div>
  );
}

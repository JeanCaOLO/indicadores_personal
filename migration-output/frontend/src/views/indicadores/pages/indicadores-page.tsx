import { useEffect, useRef } from 'react';
import type { AppSession } from '../../../shared/auth/app-session';
import { useUsuariosController } from '../../usuarios/hooks/use-usuarios-controller';
import { createUsuariosView } from '../../usuarios/engine/usuarios-view';
import { AppHeader } from '../components/app-header';
import { FilterBar } from '../components/filter-bar';
import { startDashboard } from '../engine/dashboard-engine';
import { useIndicadoresController } from '../hooks/use-indicadores-controller';

interface IndicadoresPageProps {
  session: AppSession;
  onLogout: () => Promise<void>;
}

/**
 * Tablero completo (Vista Operativa, Corporativa, Administrar datos y Usuarios). El marcado base es el
 * del original; el motor pinta cada vista dentro de las secciones v-* y conecta los controles por id.
 */
export function IndicadoresPage({ session, onLogout }: IndicadoresPageProps) {
  const { sync } = useIndicadoresController();
  const usuarios = useUsuariosController(session);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startDashboard({
      auth: { current: () => session, logout: onLogout },
      sync,
      renderUsuarios: createUsuariosView(usuarios),
    });
  }, [session, onLogout, sync, usuarios]);

  return (
    <>
      <AppHeader />
      <FilterBar />
      <main>
        <section className="view active" id="v-dash"></section>
        <section className="view" id="v-admin"></section>
        <section className="view" id="v-pres"></section>
        <section className="view" id="v-usuarios"></section>
      </main>
      <div className="toast" id="toast"></div>
      <div id="tip" className="tip"></div>
    </>
  );
}

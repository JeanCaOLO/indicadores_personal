import type { AppSession } from '../../../shared/auth/app-session';

/** Sincronización con el API (antes OLOSync). */
export interface DashboardSync {
  pull(): Promise<number>;
  push(): Promise<number>;
  available(): boolean;
}

/** Sesión (antes OLOAuth.current / OLOAuth.logout). */
export interface DashboardAuth {
  current(): AppSession | null;
  logout(): Promise<void> | void;
}

export interface DashboardDeps {
  auth: DashboardAuth;
  sync: DashboardSync;
  /** Pinta la vista Usuarios en #v-usuarios. */
  renderUsuarios(): Promise<void>;
}

/** Arranca el tablero sobre el marcado de IndicadoresPage. */
export function startDashboard(deps: DashboardDeps): Promise<void>;

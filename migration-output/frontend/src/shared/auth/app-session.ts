/** Sesión de la aplicación que devuelve GET /me (misma forma que guardaba `olo_session`). */
export type RolScope = 'global' | 'pais' | 'admin';

export interface AppRol {
  id: string;
  nombre: string;
  scope: RolScope;
  pais: string | null;
}

export interface AppSession {
  id: string;
  email: string;
  nombre: string | null;
  rol: AppRol;
}

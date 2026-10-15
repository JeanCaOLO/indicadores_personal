import { useEffect, useState } from 'react';
import { getSessionUser, onAuthStateChange, type SessionUser } from './cognito-auth';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

/** Estado de autenticación con carga explícita (para proteger rutas sin parpadeos). */
export function useAuthState(): { status: AuthStatus; user: SessionUser | null } {
  const [state, setState] = useState<{ status: AuthStatus; user: SessionUser | null }>({
    status: 'loading',
    user: null,
  });

  useEffect(() => {
    let active = true;
    const refresh = () =>
      getSessionUser()
        .then((user) => {
          if (active) setState({ status: user ? 'signed-in' : 'signed-out', user });
        })
        .catch(() => {
          if (active) setState({ status: 'signed-out', user: null });
        });
    refresh();
    const unsubscribe = onAuthStateChange(() => refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}

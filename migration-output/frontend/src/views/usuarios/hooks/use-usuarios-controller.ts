import { useEffect, useMemo, useRef } from 'react';
import type { ApiError } from '../../../shared/api/api-error';
import type { AppSession } from '../../../shared/auth/app-session';
import { usuariosApi, type CambiosUsuario, type NuevoUsuario, type Rol } from '../api/usuarios-api';

/**
 * Operaciones de la vista Usuarios con la misma interfaz que tenía OLOAuth (listRoles, saveRole,
 * deleteRole, listUsers, createUser, updateUser, deleteUser, current). Las lecturas se cancelan al
 * desmontar; un correo repetido se informa como antes ("duplicate" → "Ese correo ya existe").
 */
export function useUsuariosController(session: AppSession) {
  const abortRef = useRef(new AbortController());

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  return useMemo(
    () => ({
      current: () => session,
      listRoles: () => usuariosApi.listRoles({ signal: abortRef.current.signal }),
      saveRole: (rol: Rol) => usuariosApi.saveRole(rol),
      deleteRole: (id: string) => usuariosApi.deleteRole(id),
      listUsers: () => usuariosApi.listUsers({ signal: abortRef.current.signal }),
      createUser: async (body: NuevoUsuario) => {
        try {
          return await usuariosApi.createUser(body);
        } catch (error) {
          if ((error as ApiError).status === 409) throw new Error('duplicate');
          throw error;
        }
      },
      updateUser: (id: string, patch: CambiosUsuario) => usuariosApi.updateUser(id, patch),
      deleteUser: (id: string) => usuariosApi.deleteUser(id),
    }),
    [session],
  );
}

export type UsuariosController = ReturnType<typeof useUsuariosController>;

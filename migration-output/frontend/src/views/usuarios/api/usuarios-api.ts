import { axiosApiGateway } from '../../../shared/api/axios-api-gateway';
import type { RolScope } from '../../../shared/auth/app-session';

export interface Rol {
  id: string;
  nombre: string;
  scope: RolScope;
  pais: string | null;
  created_at?: string;
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string | null;
  rol_id: string;
  activo: boolean;
  created_at: string;
}

export interface NuevoUsuario {
  email: string;
  nombre: string;
  rol_id: string;
  password: string;
}

export type CambiosUsuario = Partial<Pick<Usuario, 'nombre' | 'rol_id' | 'activo'>>;

interface RequestOptions {
  signal?: AbortSignal;
}

const roleUrl = (id: string) => `/roles/${encodeURIComponent(id)}`;
const userUrl = (id: string) => `/usuarios/${encodeURIComponent(id)}`;

export const usuariosApi = {
  listRoles: (options: RequestOptions = {}): Promise<Rol[]> =>
    axiosApiGateway.get<Rol[]>('/roles', { signal: options.signal }).then((r) => r.data),
  saveRole: (rol: Rol): Promise<Rol> =>
    axiosApiGateway
      .put<Rol>(roleUrl(rol.id), { nombre: rol.nombre, scope: rol.scope, pais: rol.pais })
      .then((r) => r.data),
  deleteRole: (id: string): Promise<void> =>
    axiosApiGateway.delete(roleUrl(id)).then(() => undefined),
  listUsers: (options: RequestOptions = {}): Promise<Usuario[]> =>
    axiosApiGateway.get<Usuario[]>('/usuarios', { signal: options.signal }).then((r) => r.data),
  createUser: (body: NuevoUsuario): Promise<Usuario> =>
    axiosApiGateway.post<Usuario>('/usuarios', body).then((r) => r.data),
  updateUser: (id: string, patch: CambiosUsuario): Promise<Usuario> =>
    axiosApiGateway.patch<Usuario>(userUrl(id), patch).then((r) => r.data),
  deleteUser: (id: string): Promise<void> =>
    axiosApiGateway.delete(userUrl(id)).then(() => undefined),
};

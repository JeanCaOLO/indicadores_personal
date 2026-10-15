import type { UsuariosController } from '../hooks/use-usuarios-controller';

/** Crea la función que pinta "Usuarios y roles" en #v-usuarios con las operaciones del controller. */
export function createUsuariosView(gateway: UsuariosController): () => Promise<void>;

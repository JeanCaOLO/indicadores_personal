import { axiosApiGateway } from '../../../shared/api/axios-api-gateway';

/** Registro clave/valor del tablero: `__cfg` o `YYYY-MM` con el documento del mes. */
export interface RegistroIndicador {
  key: string;
  value: unknown;
}

interface RequestOptions {
  signal?: AbortSignal;
}

export const indicadoresApi = {
  /** Todos los registros visibles para el rol (antes: select key,value sobre la tabla KV). */
  list: (options: RequestOptions = {}): Promise<RegistroIndicador[]> =>
    axiosApiGateway
      .get<RegistroIndicador[]>('/indicadores/registros', { signal: options.signal })
      .then((r) => r.data),
  /** Antes: upsert({onConflict:'key'}); la fusión por país la hace ahora el servidor. */
  save: (rows: RegistroIndicador[], options: RequestOptions = {}): Promise<number> =>
    axiosApiGateway
      .put<{ count: number }>('/indicadores/registros', { rows }, { signal: options.signal })
      .then((r) => r.data.count),
};

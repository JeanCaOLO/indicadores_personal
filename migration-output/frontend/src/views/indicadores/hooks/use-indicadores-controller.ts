import { useCallback, useEffect, useMemo, useRef } from 'react';
import { indicadoresApi } from '../api/indicadores-api';

/** Copia de trabajo local del tablero (misma clave que el original). */
const LOCAL_DB_KEY = 'olo_master_db';

function readLocalDb(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Sincronización del tablero con el API (reemplaza OLOSync): `pull` trae los registros y reconstruye
 * la copia local; `push` sube la copia local completa. El motor llama a estas funciones al iniciar,
 * al guardar (con rebote) y desde el botón Sincronizar.
 */
export function useIndicadoresController() {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pull = useCallback(async (): Promise<number> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const rows = await indicadoresApi.list({ signal: controller.signal });
    const db: Record<string, unknown> = {};
    rows.forEach((row) => {
      db[row.key] = row.value;
    });
    if (Object.keys(db).length) localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
    return rows.length;
  }, []);

  const push = useCallback(async (): Promise<number> => {
    const db = readLocalDb();
    const keys = Object.keys(db);
    if (!keys.length) return 0;
    return indicadoresApi.save(keys.map((key) => ({ key, value: db[key] })));
  }, []);

  const sync = useMemo(() => ({ pull, push, available: () => true }), [pull, push]);
  return { sync };
}

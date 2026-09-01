# OLO · Indicadores de Personal — Base de datos

Infraestructura de base de datos para el proyecto de **Indicadores de Personal**.

## ⚠️ Importante: no se tocan las tablas existentes

Este proyecto crea y usa **una sola tabla nueva y exclusiva**:

```
public.olo_indicadores_kv
```

Las tablas `olo_kv`, `olo_movilidad_kv`, `olo_organigramas_kv` y `olo_salida_kv`
pertenecen a **otros proyectos** y tienen **data de producción**. Nada de este
proyecto las lee ni las escribe. La migración solo hace `create table if not exists`
sobre `olo_indicadores_kv`, así que es segura de ejecutar.

## Proyecto Supabase

- URL: `https://iigtulgpbqeypnewmzxz.supabase.co`
- anon key: pública, ya embebida en `out/index.html` y en `supabase-sync.js`.
- ⚠️ La **service_role key** es secreta: no va en el frontend ni se commitea. Si se expuso, rótala en *Dashboard → Settings → API*.

## Tabla `olo_indicadores_kv`

Mismo patrón KV que el resto de tus tablas:

| Columna      | Tipo          | Descripción                                   |
|--------------|---------------|-----------------------------------------------|
| `key`        | `text` (PK)   | Clave lógica del registro                     |
| `value`      | `jsonb`       | Documento JSON del registro                   |
| `updated_at` | `timestamptz` | Última actualización (automática por trigger) |

Claves usadas por la app (`index.html` guarda `localStorage["olo_master_db"]`):

- `__cfg` — configuración (metas, líderes, `sysUrl`, `kpiOff`).
- `YYYY-MM` — datos del mes: `activos`, `egresos`, `ausencias`, `areas`, `capacitacion`, `extras`, `vacaciones`, `merma`, `terceros`, `params`.

## Archivos

- `migrations/001_init.sql` — crea SOLO `olo_indicadores_kv` (tabla, índice, trigger propio, RLS).
- `seed.sql` — datos de ejemplo, escribe SOLO en `olo_indicadores_kv`.
- `supabase-sync.js` — versión standalone del puente (el `index.html` ya lo trae embebido).

## Cómo subirlo

### Opción A — SQL Editor del dashboard (más simple)

1. Abrí https://supabase.com/dashboard → proyecto `iigtulgpbqeypnewmzxz`.
2. **SQL Editor**.
3. Pegá y ejecutá `migrations/001_init.sql`.
4. (Opcional) pegá y ejecutá `seed.sql`.

### Opción B — Supabase CLI

```bash
supabase link --project-ref iigtulgpbqeypnewmzxz
supabase db push
supabase db execute --file supabase/seed.sql
```

## Cómo funciona la sincronización en el dashboard

`out/index.html` ya está cableado y apunta solo a `olo_indicadores_kv`:

1. Carga `@supabase/supabase-js` desde CDN.
2. Al abrir, hace **pull** de `olo_indicadores_kv` y refresca el tablero.
3. Cada vez que se guardan datos (`save()`), hace **push** automático con rebote de ~1.2 s.
4. El botón **☁ Sincronizar** del header fuerza un pull manual.

Si Supabase no está disponible, el tablero sigue funcionando con `localStorage` como respaldo.

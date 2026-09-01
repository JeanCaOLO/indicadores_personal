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

## Módulo de acceso (login por rol/país)

Tablas nuevas y exclusivas (no tocan producción):

- `olo_indicadores_usuarios` — usuarios del sistema (email, hash PBKDF2, rol).
- `olo_indicadores_roles` — catálogo de roles (CRUD desde la app).

Roles y su alcance (`scope`):

| scope    | Qué ve                                            |
|----------|---------------------------------------------------|
| `global` | Toda la data de todos los países                  |
| `pais`   | Solo la data de su país (campo `pais` del rol)    |
| `admin`  | No ve data; solo el módulo de gestión de usuarios |

Roles base incluidos: `global`, `admin`, `costa_rica`, `venezuela`. Desde la vista
**👥 Usuarios** se pueden agregar más roles (por ejemplo `Colombia`, `El Salvador`…)
y crear/editar/eliminar usuarios.

### Usuario administrador inicial

`seed_auth.sql` crea:

- email: `admin@olo.com`
- password: `admin123`  ← **cambiala tras el primer ingreso**

## Archivos

- `migrations/001_init.sql` — crea SOLO `olo_indicadores_kv` (tabla de datos).
- `migrations/002_auth.sql` — crea `olo_indicadores_usuarios` y `olo_indicadores_roles` + roles base.
- `seed.sql` — datos de ejemplo del dashboard (`olo_indicadores_kv`).
- `seed_auth.sql` — usuario admin inicial.
- `supabase-sync.js` — versión standalone del puente (el `index.html` ya lo trae embebido).

## Cómo funciona el login

`out/index.html` arranca mostrando la pantalla de acceso (con la marca OLO).

1. El usuario entra con correo + contraseña (validado contra `olo_indicadores_usuarios`, hash PBKDF2-SHA256).
2. Según el `scope` de su rol:
   - `pais` → el sistema fija el país y bloquea los selectores; solo ve su país.
   - `global` → ve todo y puede cambiar de país.
   - `admin` → no descarga ni ve data; entra directo a **👥 Usuarios**.
3. La sesión se guarda en `localStorage` (`olo_session`); "Salir" la borra.

## Cómo subirlo

### Opción A — SQL Editor del dashboard (más simple)

1. Abrí https://supabase.com/dashboard → proyecto `iigtulgpbqeypnewmzxz`.
2. **SQL Editor**.
3. Ejecutá en orden:
   - `migrations/001_init.sql` (tabla de datos)
   - `migrations/002_auth.sql` (usuarios y roles)
   - `seed_auth.sql` (admin inicial · admin@olo.com / admin123)
4. (Opcional) `seed.sql` para datos de ejemplo del dashboard.

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

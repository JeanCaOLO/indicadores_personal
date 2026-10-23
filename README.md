# Indicadores — App (Next.js + Supabase)

Aplicación de indicadores de RRHH migrada desde el sistema monolítico original
(`backup/out/index.html`) a **Next.js 16 + TypeScript + Supabase**, con UI
pixel-identical y paridad numérica verificada contra el motor original.

## Estructura

- `app/` — rutas (App Router): `(auth)/login`, `(app)/{dashboard,corporativa,comparativa,administrar,usuarios}`.
- `core/` — motor de cálculo portado 1:1 del original (KPIs, semáforos, deserción, acumulados).
- `lib/` — data layer (Supabase, assemble, queries, writes), auth (session, rbac) e IO (import/export xlsx+pdf).
- `components/` — UI (Header, FilterBar, KpiCard, tablas, vistas).
- `supabase/` — migraciones SQL (`migrations/`) y scripts de carga (`migrate/`).
- `test/` — suite (incluye `test/parity` con 2838 comparaciones contra el golden).
- `backup/` — sistema anterior preservado (`out/index.html`, `supabase/` kv).

## Desarrollo local

1. Copiá `.env.local.example` a `.env.local` y completá las claves de Supabase.
2. `npm install`
3. `npm run dev` → http://localhost:3000

El login usa el email completo (p. ej. `jalvarez@ologistics.com`).

## Variables de entorno

| Variable | Público | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sí | Clave anónima (respeta RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO (secreta)** | Solo servidor; usada por scripts de migración |

`.env.local` está git-ignored. Nunca commitees las claves.

## Scripts

- `npm run dev` — servidor de desarrollo.
- `npm run build` — build de producción.
- `npm run start` — servidor de producción (usa `$PORT`).
- `npm test` — suite completa (vitest).
- `npm run test:parity` — solo los tests de paridad numérica.

## Base de datos (Supabase)

Migraciones DDL en `supabase/migrations/` (aplicar en orden 010 → 012 → 011):

- `010_schema.sql` — tablas normalizadas `ind_*`.
- `012_profiles_auth.sql` — roles, perfiles y `ind_user_scope()`.
- `011_rls.sql` — Row Level Security por país.

Carga de datos/usuarios (requieren `SUPABASE_SERVICE_ROLE_KEY`):

```bash
npx tsx supabase/migrate/migrate-data.ts --source=supabase --drop-bogus-years
npx tsx supabase/migrate/migrate-users.ts
```

## Despliegue en Render

El repo incluye `render.yaml` (Blueprint). Pasos:

1. En Render: **New → Blueprint**, conectá este repo. Render lee `render.yaml`.
2. Build: `npm ci && npm run build`. Start: `npm run start`.
3. En el dashboard del servicio, seteá las 3 env vars (están como `sync: false`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy. El health check apunta a `/login`.

> Las rutas autenticadas se renderizan dinámicamente (Cache Components +
> `export const instant = false` en el layout protegido), así que el servicio
> debe ser un **Web Service** (no un Static Site).

-- ============================================================================
-- 012_profiles_auth.sql
-- Roles, perfiles y resolución de scope para Supabase Auth.
--
-- Portado 1:1 del diseño (.kiro/specs/indicadores-app/design.md,
-- secciones "Roles y perfiles (Supabase Auth)" y "Autenticación y RLS").
--
-- Depende de ind_paises (010_schema.sql). Por robustez se usan
-- `create table if not exists`, pero el orden de ejecución lo garantiza
-- el prefijo numérico (010 corre antes que 012).
--
-- NOTA: Este archivo NO incluye las policies RLS. Las policies (incluida
-- ind_perfiles_admin) viven en 011_rls.sql (tarea 7.3). Aquí sólo se
-- definen tablas, seeds de roles base y la función de resolución de scope.
-- Requisitos: 13.5, 14.2, 14.3
-- ============================================================================

-- ============ Roles y perfiles (Supabase Auth) ============

create table if not exists public.ind_roles (
  id     text primary key,                       -- 'global','admin','costa_rica','venezuela'
  nombre text not null,
  scope  text not null default 'pais' check (scope in ('global','pais','admin')),
  pais   text references public.ind_paises(nombre),
  created_at timestamptz not null default now()
);

create table if not exists public.ind_perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  nombre  text,
  rol_id  text not null references public.ind_roles(id),
  activo  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ Seeds de roles base ============
-- Los roles por país referencian ind_paises (FK). Esos dos países son del
-- dominio (Costa Rica, Venezuela) y la migración de datos los vuelve a
-- upsert-ear de forma idempotente. Se siembran aquí primero para no violar
-- la FK ind_roles_pais_fkey cuando ind_paises todavía está vacía.
insert into public.ind_paises (nombre) values ('Costa Rica'), ('Venezuela')
on conflict (nombre) do nothing;

-- id, nombre, scope, pais
insert into public.ind_roles (id, nombre, scope, pais) values
  ('global',      'Global',        'global', null),
  ('admin',       'Administrador', 'admin',  null),
  ('costa_rica',  'Costa Rica',    'pais',   'Costa Rica'),
  ('venezuela',   'Venezuela',     'pais',   'Venezuela')
on conflict (id) do nothing;

-- ============ Resolución del scope del usuario ============
-- Resuelve el scope y país del usuario autenticado a partir de su perfil + rol.
-- SECURITY DEFINER para que las policies RLS (011_rls.sql) puedan leer
-- ind_perfiles/ind_roles sin disparar recursión de policies, y
-- `set search_path = public` como buena práctica para funciones definer.
-- STABLE: dentro de una misma sentencia el resultado no cambia.
create or replace function public.ind_user_scope()
returns table (scope text, pais text)
language sql stable security definer set search_path = public as $$
  select r.scope, r.pais
  from public.ind_perfiles p
  join public.ind_roles r on r.id = p.rol_id
  where p.user_id = auth.uid() and p.activo
$$;

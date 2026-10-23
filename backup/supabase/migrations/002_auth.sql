-- ============================================================
-- OLO · Indicadores de Personal — Módulo de autenticación
-- ------------------------------------------------------------
-- ⚠️ Crea SOLO tablas nuevas y exclusivas de este proyecto.
-- NO toca olo_kv, olo_movilidad_kv, olo_organigramas_kv ni
-- olo_salida_kv (data de producción de otros proyectos).
--
-- Tablas:
--   olo_indicadores_roles     -> catálogo de roles (CRUD)
--   olo_indicadores_usuarios  -> usuarios del sistema (login)
--
-- Modelo de acceso (columna scope del rol):
--   scope = 'global'  -> ve toda la data de todos los países
--   scope = 'pais'    -> ve solo la data de un país (rol.pais)
--   scope = 'admin'   -> no ve data, solo gestiona usuarios
-- ============================================================

-- ---------- Roles ----------
create table if not exists public.olo_indicadores_roles (
  id         text primary key,           -- slug del rol, ej: 'costa_rica'
  nombre     text not null,              -- etiqueta visible, ej: 'Costa Rica'
  scope      text not null default 'pais',
  pais       text,                       -- solo aplica cuando scope='pais'
  created_at timestamptz not null default now(),
  constraint olo_ind_roles_scope_chk check (scope in ('global','pais','admin'))
);

-- ---------- Usuarios ----------
create table if not exists public.olo_indicadores_usuarios (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  nombre       text,
  rol_id       text not null references public.olo_indicadores_roles(id),
  pass_hash    text not null,            -- PBKDF2(SHA-256) hex
  pass_salt    text not null,            -- salt hex
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists olo_ind_usuarios_email_idx on public.olo_indicadores_usuarios (lower(email));

-- Trigger updated_at (función propia para no pisar nada)
create or replace function public.olo_indicadores_usuarios_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_olo_ind_usuarios_touch on public.olo_indicadores_usuarios;
create trigger trg_olo_ind_usuarios_touch
  before update on public.olo_indicadores_usuarios
  for each row execute function public.olo_indicadores_usuarios_touch();

-- ---------- Roles por defecto ----------
insert into public.olo_indicadores_roles (id, nombre, scope, pais) values
  ('global',      'Global',      'global', null),
  ('admin',       'Administrador','admin',  null),
  ('costa_rica',  'Costa Rica',  'pais',   'Costa Rica'),
  ('venezuela',   'Venezuela',   'pais',   'Venezuela')
on conflict (id) do nothing;

-- ---------- RLS (solo sobre estas tablas nuevas) ----------
alter table public.olo_indicadores_roles    enable row level security;
alter table public.olo_indicadores_usuarios enable row level security;

drop policy if exists olo_ind_roles_all on public.olo_indicadores_roles;
create policy olo_ind_roles_all
  on public.olo_indicadores_roles
  for all to anon, authenticated using (true) with check (true);

drop policy if exists olo_ind_usuarios_all on public.olo_indicadores_usuarios;
create policy olo_ind_usuarios_all
  on public.olo_indicadores_usuarios
  for all to anon, authenticated using (true) with check (true);

-- NOTA de seguridad:
-- Con la anon key, estas políticas permiten lectura/escritura desde el
-- navegador (coherente con una app estática). Las contraseñas se guardan
-- solo como hash PBKDF2 + salt. Para seguridad fuerte, migrar a Supabase Auth.

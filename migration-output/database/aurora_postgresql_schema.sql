-- =============================================================================
-- olo_dev_indicadores_personal — Aurora PostgreSQL — SCHEMA
-- Ambiente: dev | Base: olo_dev_indicadores_personal_db
-- Ejecutar como: master o usr_indicadores_personal_deploy conectado a olo_dev_indicadores_personal_db
-- psql -v ON_ERROR_STOP=1 ... Generado por la skill aws-project-* (no editar a mano;
-- ajustar config.yaml y regenerar).
-- =============================================================================
\set ON_ERROR_STOP on
DO $do$
BEGIN
  IF current_database() <> 'olo_dev_indicadores_personal_db' THEN
    RAISE EXCEPTION 'Base actual % distinta de la esperada olo_dev_indicadores_personal_db', current_database();
  END IF;
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION 'Destino parece Supabase. Abortado.';
  END IF;
END
$do$;
BEGIN;
SET LOCAL ROLE ddl_indicadores_personal;
SET LOCAL search_path = olo_dev_indicadores_personal_sch_core;
SET LOCAL check_function_bodies = off;

-- ---------------------------------------------------------------- tipos

-- ---------------------------------------------------------------- secuencias

-- ---------------------------------------------------------------- auth: espejo de usuarios + contexto
-- Reemplaza auth.users (Cognito es el IdP). El backend vincula cognito_sub en el primer login.
CREATE TABLE IF NOT EXISTS olo_dev_indicadores_personal_sch_core.tbl_app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cognito_sub text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_app_users PRIMARY KEY (id),
  CONSTRAINT uq_app_users_cognito_sub UNIQUE (cognito_sub)
);
CREATE INDEX IF NOT EXISTS idx_app_users_email_expr ON olo_dev_indicadores_personal_sch_core.tbl_app_users (lower(email));
-- Contexto de sesión por transacción (set_config(..., true)) fijado por PostgresUnitOfWork.
CREATE OR REPLACE FUNCTION olo_dev_indicadores_personal_sch_core.fn_auth_uid() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS $fn$SELECT nullif(current_setting('app.user_id', true), '')::uuid$fn$;
CREATE OR REPLACE FUNCTION olo_dev_indicadores_personal_sch_core.fn_auth_role() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS $fn$SELECT coalesce(nullif(current_setting('app.role', true), ''), 'anon')$fn$;
CREATE OR REPLACE FUNCTION olo_dev_indicadores_personal_sch_core.fn_auth_email() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS $fn$SELECT nullif(current_setting('app.email', true), '')$fn$;
CREATE OR REPLACE FUNCTION olo_dev_indicadores_personal_sch_core.fn_auth_jwt() RETURNS jsonb
  LANGUAGE sql STABLE PARALLEL SAFE AS $fn$SELECT coalesce(nullif(current_setting('app.jwt_claims', true), ''), '{}')::jsonb$fn$;

-- ---------------------------------------------------------------- funciones (previas a tablas)
CREATE OR REPLACE FUNCTION olo_dev_indicadores_personal_sch_core.fn_olo_indicadores_set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
AS $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
CREATE OR REPLACE FUNCTION olo_dev_indicadores_personal_sch_core.fn_olo_indicadores_usuarios_touch()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
AS $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
-- ---------------------------------------------------------------- tablas
CREATE TABLE IF NOT EXISTS olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_kv (
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_roles (
  id text NOT NULL,
  nombre text NOT NULL,
  scope text DEFAULT 'pais'::text NOT NULL,
  pais text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  nombre text,
  rol_id text NOT NULL,
  pass_hash text NOT NULL,
  pass_salt text NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------- constraints (PK/UQ/CK/EX → FK)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_kv'::regclass
                 AND conname = 'pk_olo_indicadores_kv') THEN
    ALTER TABLE olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_kv ADD CONSTRAINT pk_olo_indicadores_kv PRIMARY KEY (key);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_roles'::regclass
                 AND conname = 'pk_olo_indicadores_roles') THEN
    ALTER TABLE olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_roles ADD CONSTRAINT pk_olo_indicadores_roles PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios'::regclass
                 AND conname = 'pk_olo_indicadores_usuarios') THEN
    ALTER TABLE olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios ADD CONSTRAINT pk_olo_indicadores_usuarios PRIMARY KEY (id);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios'::regclass
                 AND conname = 'uq_olo_indicadores_usuarios_email') THEN
    ALTER TABLE olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios ADD CONSTRAINT uq_olo_indicadores_usuarios_email UNIQUE (email);
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_roles'::regclass
                 AND conname = 'ck_olo_indicadores_roles_scope') THEN
    ALTER TABLE olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_roles ADD CONSTRAINT ck_olo_indicadores_roles_scope CHECK ((scope = ANY (ARRAY['global'::text, 'pais'::text, 'admin'::text])));
  END IF;
END
$do$;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios'::regclass
                 AND conname = 'fk_olo_indicadores_usuarios_olo_indicadores_roles') THEN
    ALTER TABLE olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios ADD CONSTRAINT fk_olo_indicadores_usuarios_olo_indicadores_roles FOREIGN KEY (rol_id) REFERENCES tbl_olo_indicadores_roles(id);
  END IF;
END
$do$;

-- ---------------------------------------------------------------- índices
CREATE INDEX IF NOT EXISTS idx_olo_indicadores_kv_value_gin ON olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_kv USING gin (value);
CREATE INDEX IF NOT EXISTS idx_olo_indicadores_usuarios_olo_ind_usuarios_email ON olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios USING btree (lower(email));

-- ---------------------------------------------------------------- funciones (usan tipos de tabla)
-- ---------------------------------------------------------------- vistas y vistas materializadas

-- ---------------------------------------------------------------- índices de vistas materializadas

-- ---------------------------------------------------------------- triggers
DROP TRIGGER IF EXISTS trg_olo_indicadores_kv_updated ON olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_kv;
CREATE TRIGGER trg_olo_indicadores_kv_updated BEFORE UPDATE ON olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_kv FOR EACH ROW EXECUTE FUNCTION fn_olo_indicadores_set_updated_at();
DROP TRIGGER IF EXISTS trg_olo_indicadores_usuarios_trg_olo_ind_usuarios_touch ON olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios;
CREATE TRIGGER trg_olo_indicadores_usuarios_trg_olo_ind_usuarios_touch BEFORE UPDATE ON olo_dev_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios FOR EACH ROW EXECUTE FUNCTION fn_olo_indicadores_usuarios_touch();

-- RLS: rls_mode=backend → la autorización vive en los use cases (ver generation-report.json).

COMMIT;

\echo 'Esquema creado/actualizado.'

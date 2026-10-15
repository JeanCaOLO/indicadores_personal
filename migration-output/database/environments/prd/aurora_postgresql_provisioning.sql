-- =============================================================================
-- olo_prd_indicadores_personal — Aurora PostgreSQL — PROVISIONING
-- Ambiente: prd | Base: olo_prd_indicadores_personal_db
-- Ejecutar como: master (rds_superuser) conectado a la base 'postgres'
-- psql -v ON_ERROR_STOP=1 ... Generado por la skill aws-project-* (no editar a mano;
-- ajustar config.yaml y regenerar).
-- =============================================================================
\set ON_ERROR_STOP on
-- Variables requeridas: -v pass_ro=... -v pass_rw=... -v pass_ddl=... -v pass_admin=...
\if :{?pass_ro}
\else
  \echo 'Falta la variable psql pass_ro (-v pass_ro=...)'
  SELECT 1/0 AS falta_pass_ro;
\endif
\if :{?pass_rw}
\else
  \echo 'Falta la variable psql pass_rw (-v pass_rw=...)'
  SELECT 1/0 AS falta_pass_rw;
\endif
\if :{?pass_ddl}
\else
  \echo 'Falta la variable psql pass_ddl (-v pass_ddl=...)'
  SELECT 1/0 AS falta_pass_ddl;
\endif
\if :{?pass_admin}
\else
  \echo 'Falta la variable psql pass_admin (-v pass_admin=...)'
  SELECT 1/0 AS falta_pass_admin;
\endif

-- 0. Guarda: nunca ejecutar contra Supabase
DO $do$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL THEN
    RAISE EXCEPTION 'Destino parece un proyecto Supabase (auth.users/storage.objects). Abortado.';
  END IF;
END
$do$;

-- 1. Política de contraseñas (>=12, mayúscula, minúscula, número, especial; no expiran)
SELECT set_config('dbkit.check_pass_ro', :'pass_ro', false) AS _ \gset
DO $do$
DECLARE p text := current_setting('dbkit.check_pass_ro');
BEGIN
  IF length(p) < 12 OR p !~ '[A-Z]' OR p !~ '[a-z]' OR p !~ '[0-9]' OR p !~ '[^A-Za-z0-9]' THEN
    RAISE EXCEPTION 'La contraseña pass_ro no cumple la política (>=12, mayúscula, minúscula, número, especial)';
  END IF;
  PERFORM set_config('dbkit.check_pass_ro', '', false);
END
$do$;
SELECT set_config('dbkit.check_pass_rw', :'pass_rw', false) AS _ \gset
DO $do$
DECLARE p text := current_setting('dbkit.check_pass_rw');
BEGIN
  IF length(p) < 12 OR p !~ '[A-Z]' OR p !~ '[a-z]' OR p !~ '[0-9]' OR p !~ '[^A-Za-z0-9]' THEN
    RAISE EXCEPTION 'La contraseña pass_rw no cumple la política (>=12, mayúscula, minúscula, número, especial)';
  END IF;
  PERFORM set_config('dbkit.check_pass_rw', '', false);
END
$do$;
SELECT set_config('dbkit.check_pass_ddl', :'pass_ddl', false) AS _ \gset
DO $do$
DECLARE p text := current_setting('dbkit.check_pass_ddl');
BEGIN
  IF length(p) < 12 OR p !~ '[A-Z]' OR p !~ '[a-z]' OR p !~ '[0-9]' OR p !~ '[^A-Za-z0-9]' THEN
    RAISE EXCEPTION 'La contraseña pass_ddl no cumple la política (>=12, mayúscula, minúscula, número, especial)';
  END IF;
  PERFORM set_config('dbkit.check_pass_ddl', '', false);
END
$do$;
SELECT set_config('dbkit.check_pass_admin', :'pass_admin', false) AS _ \gset
DO $do$
DECLARE p text := current_setting('dbkit.check_pass_admin');
BEGIN
  IF length(p) < 12 OR p !~ '[A-Z]' OR p !~ '[a-z]' OR p !~ '[0-9]' OR p !~ '[^A-Za-z0-9]' THEN
    RAISE EXCEPTION 'La contraseña pass_admin no cumple la política (>=12, mayúscula, minúscula, número, especial)';
  END IF;
  PERFORM set_config('dbkit.check_pass_admin', '', false);
END
$do$;

-- 2. Roles de grupo (NOLOGIN). Herencia: admin > ddl > rw > ro
SELECT format('CREATE ROLE %I NOLOGIN', 'ro_indicadores_personal')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ro_indicadores_personal') \gexec
SELECT format('CREATE ROLE %I NOLOGIN', 'rw_indicadores_personal')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rw_indicadores_personal') \gexec
SELECT format('CREATE ROLE %I NOLOGIN', 'ddl_indicadores_personal')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ddl_indicadores_personal') \gexec
SELECT format('CREATE ROLE %I NOLOGIN', 'admin_indicadores_personal')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_indicadores_personal') \gexec
GRANT ro_indicadores_personal TO rw_indicadores_personal;
GRANT rw_indicadores_personal TO ddl_indicadores_personal;
GRANT ddl_indicadores_personal TO admin_indicadores_personal;
-- el master necesita membresía para SET ROLE, ALTER DEFAULT PRIVILEGES y OWNER de la base
SELECT format('GRANT %I TO %I', 'admin_indicadores_personal', current_user) \gexec

-- 3. Usuarios (LOGIN) con contraseña parametrizada que no expira
SELECT format('CREATE ROLE %I LOGIN', 'usr_indicadores_personal_report')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'usr_indicadores_personal_report') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L VALID UNTIL %L', 'usr_indicadores_personal_report', :'pass_ro', 'infinity') \gexec
GRANT ro_indicadores_personal TO usr_indicadores_personal_report;
SELECT format('CREATE ROLE %I LOGIN', 'usr_indicadores_personal_app')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'usr_indicadores_personal_app') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L VALID UNTIL %L', 'usr_indicadores_personal_app', :'pass_rw', 'infinity') \gexec
GRANT rw_indicadores_personal TO usr_indicadores_personal_app;
SELECT format('CREATE ROLE %I LOGIN', 'usr_indicadores_personal_deploy')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'usr_indicadores_personal_deploy') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L VALID UNTIL %L', 'usr_indicadores_personal_deploy', :'pass_ddl', 'infinity') \gexec
GRANT ddl_indicadores_personal TO usr_indicadores_personal_deploy;
SELECT format('CREATE ROLE %I LOGIN', 'usr_indicadores_personal_dba')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'usr_indicadores_personal_dba') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L VALID UNTIL %L', 'usr_indicadores_personal_dba', :'pass_admin', 'infinity') \gexec
GRANT admin_indicadores_personal TO usr_indicadores_personal_dba;

-- 4. Base de datos (CREATE DATABASE no admite IF NOT EXISTS ni transacción)
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L', 'olo_prd_indicadores_personal_db', 'admin_indicadores_personal', 'UTF8')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'olo_prd_indicadores_personal_db') \gexec
\connect olo_prd_indicadores_personal_db
REVOKE ALL ON DATABASE olo_prd_indicadores_personal_db FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE olo_prd_indicadores_personal_db TO ro_indicadores_personal;
GRANT ALL ON DATABASE olo_prd_indicadores_personal_db TO admin_indicadores_personal;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 5. Esquemas, permisos y default privileges (se repite por esquema)
-- >>> PER_SCHEMA_BEGIN <<<
CREATE SCHEMA IF NOT EXISTS olo_prd_indicadores_personal_sch_core AUTHORIZATION ddl_indicadores_personal;
GRANT USAGE ON SCHEMA olo_prd_indicadores_personal_sch_core TO ro_indicadores_personal;
GRANT ALL ON SCHEMA olo_prd_indicadores_personal_sch_core TO admin_indicadores_personal;
GRANT SELECT ON ALL TABLES IN SCHEMA olo_prd_indicadores_personal_sch_core TO ro_indicadores_personal;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA olo_prd_indicadores_personal_sch_core TO ro_indicadores_personal;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA olo_prd_indicadores_personal_sch_core TO rw_indicadores_personal;
GRANT USAGE, UPDATE ON ALL SEQUENCES IN SCHEMA olo_prd_indicadores_personal_sch_core TO rw_indicadores_personal;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA olo_prd_indicadores_personal_sch_core TO rw_indicadores_personal;
GRANT ALL ON ALL TABLES IN SCHEMA olo_prd_indicadores_personal_sch_core TO admin_indicadores_personal;
GRANT ALL ON ALL SEQUENCES IN SCHEMA olo_prd_indicadores_personal_sch_core TO admin_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE ddl_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT SELECT ON TABLES TO ro_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE ddl_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT SELECT ON SEQUENCES TO ro_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE ddl_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT INSERT, UPDATE, DELETE ON TABLES TO rw_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE ddl_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT USAGE, UPDATE ON SEQUENCES TO rw_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE ddl_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT EXECUTE ON FUNCTIONS TO rw_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE ddl_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT ALL ON TABLES TO admin_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE admin_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT SELECT ON TABLES TO ro_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE admin_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT SELECT ON SEQUENCES TO ro_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE admin_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT INSERT, UPDATE, DELETE ON TABLES TO rw_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE admin_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT USAGE, UPDATE ON SEQUENCES TO rw_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE admin_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT EXECUTE ON FUNCTIONS TO rw_indicadores_personal;
ALTER DEFAULT PRIVILEGES FOR ROLE admin_indicadores_personal IN SCHEMA olo_prd_indicadores_personal_sch_core GRANT ALL ON TABLES TO admin_indicadores_personal;
-- >>> PER_SCHEMA_END <<<

-- 6. Funciones: sin EXECUTE para PUBLIC en objetos futuros
ALTER DEFAULT PRIVILEGES FOR ROLE ddl_indicadores_personal REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE admin_indicadores_personal REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 7. search_path fijado por usuario (la app NO ejecuta SET en runtime → sin pinning en RDS Proxy)
ALTER ROLE usr_indicadores_personal_report IN DATABASE olo_prd_indicadores_personal_db SET search_path = olo_prd_indicadores_personal_sch_core;
ALTER ROLE usr_indicadores_personal_app IN DATABASE olo_prd_indicadores_personal_db SET search_path = olo_prd_indicadores_personal_sch_core;
ALTER ROLE usr_indicadores_personal_deploy IN DATABASE olo_prd_indicadores_personal_db SET search_path = olo_prd_indicadores_personal_sch_core;
ALTER ROLE usr_indicadores_personal_dba IN DATABASE olo_prd_indicadores_personal_db SET search_path = olo_prd_indicadores_personal_sch_core;

-- 8. Extensiones (compatibles o con adaptación documentada)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA olo_prd_indicadores_personal_sch_core;

\echo 'Provisioning completado.'

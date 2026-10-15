-- =============================================================================
-- olo_qa_indicadores_personal — Aurora PostgreSQL — ROLLBACK
-- Ambiente: qa | Base: olo_qa_indicadores_personal_db
-- Ejecutar como: master conectado a olo_qa_indicadores_personal_db. Orden descendente; NUNCA contra Supabase
-- psql -v ON_ERROR_STOP=1 ... Generado por la skill aws-project-* (no editar a mano;
-- ajustar config.yaml y regenerar).
-- =============================================================================
\set ON_ERROR_STOP on
DO $do$
BEGIN
  IF current_database() <> 'olo_qa_indicadores_personal_db' THEN
    RAISE EXCEPTION 'Rollback abortado: base actual % distinta de olo_qa_indicadores_personal_db', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth', 'storage', 'supabase_functions', 'realtime')) THEN
    RAISE EXCEPTION 'Rollback abortado: se detectaron esquemas de Supabase en la base actual.';
  END IF;
END
$do$;
BEGIN;
-- 0a. extensiones del aplicativo (la base es exclusiva del aplicativo; arrastran sus índices)
DROP EXTENSION IF EXISTS pgcrypto CASCADE;
-- 0b. todo lo que pertenece al rol ddl del aplicativo: lo generado por la skill y lo agregado por
--     database/changes (incluida tbl_schema_changes) aunque dependa entre sí. Un objeto de OTRO
--     dueño que dependa de estos hace fallar el rollback (DROP OWNED no usa CASCADE).
DROP OWNED BY ddl_indicadores_personal;
-- 1. triggers y políticas
DO $do$
BEGIN
  IF to_regclass('olo_qa_indicadores_personal_sch_core.tbl_olo_indicadores_kv') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_olo_indicadores_kv_updated ON olo_qa_indicadores_personal_sch_core.tbl_olo_indicadores_kv; END IF;
  IF to_regclass('olo_qa_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios') IS NOT NULL THEN DROP TRIGGER IF EXISTS trg_olo_indicadores_usuarios_trg_olo_ind_usuarios_touch ON olo_qa_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios; END IF;
END
$do$;
-- 2. vistas materializadas y vistas
-- 3. FK
ALTER TABLE IF EXISTS olo_qa_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios DROP CONSTRAINT IF EXISTS fk_olo_indicadores_usuarios_olo_indicadores_roles;
-- 4. tablas (orden topológico inverso)
DROP TABLE IF EXISTS olo_qa_indicadores_personal_sch_core.tbl_olo_indicadores_usuarios;
DROP TABLE IF EXISTS olo_qa_indicadores_personal_sch_core.tbl_olo_indicadores_roles;
DROP TABLE IF EXISTS olo_qa_indicadores_personal_sch_core.tbl_olo_indicadores_kv;
-- 5. funciones
DROP ROUTINE IF EXISTS olo_qa_indicadores_personal_sch_core.fn_olo_indicadores_usuarios_touch();
DROP ROUTINE IF EXISTS olo_qa_indicadores_personal_sch_core.fn_olo_indicadores_set_updated_at();
DROP TABLE IF EXISTS olo_qa_indicadores_personal_sch_core.tbl_app_users;
DROP FUNCTION IF EXISTS olo_qa_indicadores_personal_sch_core.fn_auth_uid();
DROP FUNCTION IF EXISTS olo_qa_indicadores_personal_sch_core.fn_auth_role();
DROP FUNCTION IF EXISTS olo_qa_indicadores_personal_sch_core.fn_auth_email();
DROP FUNCTION IF EXISTS olo_qa_indicadores_personal_sch_core.fn_auth_jwt();
-- 6. secuencias y tipos
-- 7. extensiones
DROP EXTENSION IF EXISTS pgcrypto;
-- 8. esquemas (RESTRICT: falla si quedan objetos no generados por esta skill)
DROP SCHEMA IF EXISTS olo_qa_indicadores_personal_sch_core;
-- 9. privilegios y default privileges de los roles en esta base
DROP OWNED BY ro_indicadores_personal, rw_indicadores_personal, ddl_indicadores_personal, admin_indicadores_personal;
COMMIT;

-- 10. Base de datos, usuarios y roles: requiere conexión a 'postgres' y CONFIRMACIÓN HUMANA.
--     Descomentar el bloque y ejecutarlo aparte.
-- >>> MANUAL_BEGIN <<<
-- \connect postgres
-- DROP DATABASE IF EXISTS olo_qa_indicadores_personal_db;
-- DROP ROLE IF EXISTS usr_indicadores_personal_dba;
-- DROP ROLE IF EXISTS usr_indicadores_personal_deploy;
-- DROP ROLE IF EXISTS usr_indicadores_personal_app;
-- DROP ROLE IF EXISTS usr_indicadores_personal_report;
-- REVOKE admin_indicadores_personal FROM CURRENT_USER;
-- DROP ROLE IF EXISTS admin_indicadores_personal;
-- DROP ROLE IF EXISTS ddl_indicadores_personal;
-- DROP ROLE IF EXISTS rw_indicadores_personal;
-- DROP ROLE IF EXISTS ro_indicadores_personal;
-- >>> MANUAL_END <<<

\echo 'Rollback de objetos completado.'

-- ============================================================================
-- 011_rls.sql — Row Level Security (RLS) para indicadores-app
-- ----------------------------------------------------------------------------
-- Fuente de verdad: sección "Autenticación y RLS" del diseño
-- (.kiro/specs/indicadores-app/design.md). Portado 1:1 del patrón de policy
-- documentado allí.
--
-- Objetivo de seguridad (Req 13): el control de acceso por país se aplica en el
-- SERVIDOR mediante RLS, de modo que un usuario con Scope_Pais nunca reciba
-- filas de otro país en su navegador (Req 13.1, 13.4). Global ve todos los
-- países (Req 13.2); Admin gestiona usuarios pero NO ve data de indicadores
-- (Req 13.3). Los alcances global/pais/admin conservan su significado del
-- sistema actual (Req 13.5).
--
-- Depende de:
--   010_schema.sql       → tablas de catálogos, datos, parámetros y config
--   012_profiles_auth.sql→ ind_roles, ind_perfiles y public.ind_user_scope()
-- El orden de ejecución lo garantiza el prefijo numérico (010 y 012 corren
-- antes que 011 en el runner por orden alfabético; 012 debe aplicarse antes
-- que 011 para que exista ind_user_scope()).
--
-- Todas las policies son IDEMPOTENTES: `drop policy if exists` antes de cada
-- `create policy`, de modo que esta migración se puede re-aplicar sin error.
--
-- Nota sobre ambigüedad de columna: ind_user_scope() devuelve una columna
-- `pais`, y las tablas de datos también tienen una columna `pais`. Por eso la
-- función SIEMPRE se aliasa como `s` y la comparación se escribe calificada:
--   s.pais = <tabla>.pais
-- así nunca hay ambigüedad entre el país del usuario y el país de la fila.
--
-- _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 14.1_
-- ============================================================================


-- ############################################################################
-- 1) HABILITAR RLS EN TODAS LAS TABLAS ind_*
-- ----------------------------------------------------------------------------
-- Con RLS habilitado y SIN policy, el acceso queda denegado por defecto; por
-- eso debajo se definen policies explícitas para cada tabla.
-- ############################################################################

-- Catálogos
alter table public.ind_paises             enable row level security;
alter table public.ind_meses              enable row level security;

-- Tablas de datos con columna `pais`
alter table public.ind_colaboradores      enable row level security;
alter table public.ind_egresos            enable row level security;
alter table public.ind_ausencias          enable row level security;
alter table public.ind_vacaciones         enable row level security;
alter table public.ind_extras             enable row level security;
alter table public.ind_capacitacion       enable row level security;
alter table public.ind_merma              enable row level security;
alter table public.ind_terceros           enable row level security;
alter table public.ind_parametros_mes     enable row level security;

-- Tabla de datos SIN columna `pais`
alter table public.ind_areas              enable row level security;

-- Config global
alter table public.ind_config_metas        enable row level security;
alter table public.ind_config_leaders      enable row level security;
alter table public.ind_config_kpi_off      enable row level security;
alter table public.ind_config_satisfaccion enable row level security;
alter table public.ind_config_kv           enable row level security;

-- Roles y perfiles (gestión de usuarios)
alter table public.ind_roles              enable row level security;
alter table public.ind_perfiles           enable row level security;


-- ############################################################################
-- 2) TABLAS DE DATOS CON COLUMNA `pais`
-- ----------------------------------------------------------------------------
-- Patrón del diseño: por cada tabla, una policy de SELECT y una policy de
-- escritura (FOR ALL → insert/update/delete).
--   · scope='global' → ve/escribe todos los países.
--   · scope='pais'   → solo filas donde s.pais = <tabla>.pais.
--   · scope='admin'  → no aparece en el predicado → no ve ni escribe data.
-- El WITH CHECK (en la policy de escritura) aplica la misma regla a las filas
-- insertadas/actualizadas, evitando que un usuario de país "mueva" una fila a
-- otro país.
-- ############################################################################

-- ---- ind_colaboradores -----------------------------------------------------
drop policy if exists ind_colaboradores_select on public.ind_colaboradores;
create policy ind_colaboradores_select on public.ind_colaboradores for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_colaboradores.pais))
);

drop policy if exists ind_colaboradores_write on public.ind_colaboradores;
create policy ind_colaboradores_write on public.ind_colaboradores for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_colaboradores.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_colaboradores.pais))
);

-- ---- ind_egresos -----------------------------------------------------------
drop policy if exists ind_egresos_select on public.ind_egresos;
create policy ind_egresos_select on public.ind_egresos for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_egresos.pais))
);

drop policy if exists ind_egresos_write on public.ind_egresos;
create policy ind_egresos_write on public.ind_egresos for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_egresos.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_egresos.pais))
);

-- ---- ind_ausencias ---------------------------------------------------------
drop policy if exists ind_ausencias_select on public.ind_ausencias;
create policy ind_ausencias_select on public.ind_ausencias for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_ausencias.pais))
);

drop policy if exists ind_ausencias_write on public.ind_ausencias;
create policy ind_ausencias_write on public.ind_ausencias for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_ausencias.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_ausencias.pais))
);

-- ---- ind_vacaciones --------------------------------------------------------
drop policy if exists ind_vacaciones_select on public.ind_vacaciones;
create policy ind_vacaciones_select on public.ind_vacaciones for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_vacaciones.pais))
);

drop policy if exists ind_vacaciones_write on public.ind_vacaciones;
create policy ind_vacaciones_write on public.ind_vacaciones for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_vacaciones.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_vacaciones.pais))
);

-- ---- ind_extras ------------------------------------------------------------
drop policy if exists ind_extras_select on public.ind_extras;
create policy ind_extras_select on public.ind_extras for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_extras.pais))
);

drop policy if exists ind_extras_write on public.ind_extras;
create policy ind_extras_write on public.ind_extras for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_extras.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_extras.pais))
);

-- ---- ind_capacitacion ------------------------------------------------------
drop policy if exists ind_capacitacion_select on public.ind_capacitacion;
create policy ind_capacitacion_select on public.ind_capacitacion for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_capacitacion.pais))
);

drop policy if exists ind_capacitacion_write on public.ind_capacitacion;
create policy ind_capacitacion_write on public.ind_capacitacion for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_capacitacion.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_capacitacion.pais))
);

-- ---- ind_merma -------------------------------------------------------------
drop policy if exists ind_merma_select on public.ind_merma;
create policy ind_merma_select on public.ind_merma for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_merma.pais))
);

drop policy if exists ind_merma_write on public.ind_merma;
create policy ind_merma_write on public.ind_merma for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_merma.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_merma.pais))
);

-- ---- ind_terceros ----------------------------------------------------------
drop policy if exists ind_terceros_select on public.ind_terceros;
create policy ind_terceros_select on public.ind_terceros for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_terceros.pais))
);

drop policy if exists ind_terceros_write on public.ind_terceros;
create policy ind_terceros_write on public.ind_terceros for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_terceros.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_terceros.pais))
);

-- ---- ind_parametros_mes ----------------------------------------------------
drop policy if exists ind_parametros_mes_select on public.ind_parametros_mes;
create policy ind_parametros_mes_select on public.ind_parametros_mes for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_parametros_mes.pais))
);

drop policy if exists ind_parametros_mes_write on public.ind_parametros_mes;
create policy ind_parametros_mes_write on public.ind_parametros_mes for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_parametros_mes.pais))
)
with check (
  exists (select 1 from public.ind_user_scope() s
          where s.scope = 'global'
             or (s.scope = 'pais' and s.pais = ind_parametros_mes.pais))
);


-- ############################################################################
-- 3) ind_areas — tabla de DATOS SIN columna `pais`
-- ----------------------------------------------------------------------------
-- DECISIÓN (según diseño, sección "Policies RLS por tabla"):
--   "ind_areas no tiene país (igual que el sistema actual); su policy permite
--    lectura a global/pais y escritura a global".
-- Por tanto:
--   · SELECT: scope 'global' o 'pais' (ambos ven áreas). 'admin' NO (no ve data).
--   · WRITE : solo 'global' (es quien gestiona el catálogo de áreas global).
-- Como la tabla no tiene columna `pais`, no hay filtro por país; basta con
-- comprobar el scope del usuario.
-- ############################################################################

drop policy if exists ind_areas_select on public.ind_areas;
create policy ind_areas_select on public.ind_areas for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s
          where s.scope in ('global', 'pais'))
);

drop policy if exists ind_areas_write on public.ind_areas;
create policy ind_areas_write on public.ind_areas for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope = 'global')
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope = 'global')
);


-- ############################################################################
-- 4) CATÁLOGOS SIN país: ind_meses, ind_paises
-- ----------------------------------------------------------------------------
-- DECISIÓN: son catálogos de referencia que toda la app necesita leer para
-- poblar selectores de mes/país. Por eso:
--   · SELECT: cualquier usuario autenticado (global/pais/admin).
--   · WRITE : solo 'global' o 'admin' (mantenimiento del catálogo), nunca 'pais'
--     (un usuario de país no crea países ni meses del catálogo global).
-- ############################################################################

-- ---- ind_meses -------------------------------------------------------------
drop policy if exists ind_meses_select on public.ind_meses;
create policy ind_meses_select on public.ind_meses for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s)
);

drop policy if exists ind_meses_write on public.ind_meses;
create policy ind_meses_write on public.ind_meses for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
);

-- ---- ind_paises ------------------------------------------------------------
drop policy if exists ind_paises_select on public.ind_paises;
create policy ind_paises_select on public.ind_paises for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s)
);

drop policy if exists ind_paises_write on public.ind_paises;
create policy ind_paises_write on public.ind_paises for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
);


-- ############################################################################
-- 5) CONFIG GLOBAL: ind_config_metas / _leaders / _kpi_off / _satisfaccion / _kv
-- ----------------------------------------------------------------------------
-- DECISIÓN: la config (metas, líderes, KPIs apagados, satisfacción, kv) es
-- global (no tiene país) y alimenta el cálculo de indicadores que ven los
-- usuarios de data. Por eso:
--   · SELECT: usuarios que ven data → scope 'global' o 'pais'. 'admin' NO.
--   · WRITE : solo 'global' o 'admin' (mantenimiento de configuración global).
-- ############################################################################

-- ---- ind_config_metas ------------------------------------------------------
drop policy if exists ind_config_metas_select on public.ind_config_metas;
create policy ind_config_metas_select on public.ind_config_metas for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'pais'))
);

drop policy if exists ind_config_metas_write on public.ind_config_metas;
create policy ind_config_metas_write on public.ind_config_metas for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
);

-- ---- ind_config_leaders ----------------------------------------------------
drop policy if exists ind_config_leaders_select on public.ind_config_leaders;
create policy ind_config_leaders_select on public.ind_config_leaders for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'pais'))
);

drop policy if exists ind_config_leaders_write on public.ind_config_leaders;
create policy ind_config_leaders_write on public.ind_config_leaders for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
);

-- ---- ind_config_kpi_off ----------------------------------------------------
drop policy if exists ind_config_kpi_off_select on public.ind_config_kpi_off;
create policy ind_config_kpi_off_select on public.ind_config_kpi_off for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'pais'))
);

drop policy if exists ind_config_kpi_off_write on public.ind_config_kpi_off;
create policy ind_config_kpi_off_write on public.ind_config_kpi_off for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
);

-- ---- ind_config_satisfaccion -----------------------------------------------
drop policy if exists ind_config_satisfaccion_select on public.ind_config_satisfaccion;
create policy ind_config_satisfaccion_select on public.ind_config_satisfaccion for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'pais'))
);

drop policy if exists ind_config_satisfaccion_write on public.ind_config_satisfaccion;
create policy ind_config_satisfaccion_write on public.ind_config_satisfaccion for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
);

-- ---- ind_config_kv ---------------------------------------------------------
drop policy if exists ind_config_kv_select on public.ind_config_kv;
create policy ind_config_kv_select on public.ind_config_kv for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'pais'))
);

drop policy if exists ind_config_kv_write on public.ind_config_kv;
create policy ind_config_kv_write on public.ind_config_kv for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('global', 'admin'))
);


-- ############################################################################
-- 6) GESTIÓN DE USUARIOS: ind_roles / ind_perfiles
-- ----------------------------------------------------------------------------
-- DECISIÓN (según diseño "Policy para gestión de usuarios (Req 14)"):
--   "Solo admin o global pueden gestionar perfiles/roles".
-- Además se añade un SELF-READ: cualquier usuario autenticado puede leer SU
-- PROPIO perfil (necesario para resolver su scope/rol en la UI), comparando
-- ind_perfiles.user_id = auth.uid().
--
-- IMPORTANTE sobre recursión: ind_user_scope() es SECURITY DEFINER (ver 012),
-- por lo que al consultar ind_perfiles/ind_roles dentro de la función NO se
-- re-evalúan estas policies → no hay recursión infinita de RLS.
-- ############################################################################

-- ---- ind_roles -------------------------------------------------------------
-- SELECT: admin/global gestionan; además, cualquier autenticado puede leer los
-- roles (el catálogo de roles es pequeño y necesario para mostrar el rol propio
-- en la UI). Se restringe la ESCRITURA a admin/global.
drop policy if exists ind_roles_select on public.ind_roles;
create policy ind_roles_select on public.ind_roles for select to authenticated
using (
  exists (select 1 from public.ind_user_scope() s)
);

drop policy if exists ind_roles_manage on public.ind_roles;
create policy ind_roles_manage on public.ind_roles for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('admin', 'global'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('admin', 'global'))
);

-- ---- ind_perfiles ----------------------------------------------------------
-- SELECT: admin/global ven todos los perfiles (gestión); un usuario cualquiera
-- ve solo el suyo (self-read vía auth.uid()).
drop policy if exists ind_perfiles_select on public.ind_perfiles;
create policy ind_perfiles_select on public.ind_perfiles for select to authenticated
using (
  ind_perfiles.user_id = auth.uid()
  or exists (select 1 from public.ind_user_scope() s where s.scope in ('admin', 'global'))
);

-- WRITE (insert/update/delete): solo admin/global, tal como en el diseño
-- (policy ind_perfiles_admin). Se mantiene el nombre del diseño para esta
-- policy de gestión.
drop policy if exists ind_perfiles_admin on public.ind_perfiles;
create policy ind_perfiles_admin on public.ind_perfiles for all to authenticated
using (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('admin', 'global'))
)
with check (
  exists (select 1 from public.ind_user_scope() s where s.scope in ('admin', 'global'))
);

-- ============================================================================
-- Fin de 011_rls.sql
-- ============================================================================

-- ============================================================================
-- 010_schema.sql — Esquema normalizado de indicadores-app
-- ----------------------------------------------------------------------------
-- Reemplaza el esquema key/value `olo_indicadores_kv` (una fila por `YYYY-MM`
-- con un JSON gigante) por tablas relacionales. Todas las tablas nuevas usan el
-- prefijo `ind_` para NO colisionar con las tablas kv de la suite OLO, que
-- permanecen intactas (olo_indicadores_kv, olo_indicadores_usuarios,
-- olo_indicadores_roles).
--
-- Decisión de modelado: snapshot mensual. El mismo colaborador (misma cédula)
-- aparece en varios meses; sus atributos pueden cambiar mes a mes. El motor
-- compute() nunca arrastra el roster de otros meses. Por eso `ind_colaboradores`
-- guarda una fila por (cédula, mes, país) y su PK es compuesta.
--
-- Esta migración crea SOLO el esquema de catálogos, datos, parámetros y config.
-- Los roles/perfiles (012_profiles_auth.sql) y las policies RLS (011_rls.sql)
-- van en archivos separados.
--
-- _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
-- ============================================================================

-- ============ Catálogos ============
create table if not exists public.ind_paises (
  nombre text primary key                       -- 'Costa Rica', 'Venezuela'
);

create table if not exists public.ind_meses (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$')   -- 'YYYY-MM'
);

-- ============ Snapshot mensual de colaboradores ============
create table if not exists public.ind_colaboradores (
  cedula           text not null,               -- clave natural de la persona (Req 11.2)
  mes              text not null references public.ind_meses(mes) on delete cascade,
  pais             text not null references public.ind_paises(nombre),
  nombre           text,
  departamento     text,
  area             text,
  sexo             text,
  fecha_nacimiento date,
  fecha_ingreso    date,
  nivel            text,                         -- N1..N5
  nivel_educativo  text,
  carrera          text,
  movilidad        text,                         -- M1..M7 NN
  movimiento       text,                         -- Promoción / Ascenso / Sin cambio
  tipo             text,                         -- Indeterminado / Determinado
  paso             text,
  vac_disfrutadas  numeric default 0,
  vac_pendientes   numeric default 0,
  primary key (cedula, mes, pais)                -- un snapshot por persona/mes/país
);
create index if not exists ind_colab_mes_pais on public.ind_colaboradores (mes, pais);
create index if not exists ind_colab_dep       on public.ind_colaboradores (mes, pais, departamento);

-- ============ Egresos ============
create table if not exists public.ind_egresos (
  id            bigint generated always as identity primary key,
  cedula        text,
  mes           text not null references public.ind_meses(mes) on delete cascade,
  pais          text not null references public.ind_paises(nombre),
  nombre        text,
  departamento  text,
  motivo        text,                            -- Renuncia / Despido / Finalización / …
  fecha_ingreso date,
  fecha_salida  date,
  movilidad     text,
  recomienda    text                             -- Sí / No / ''
);
create index if not exists ind_egresos_mes_pais on public.ind_egresos (mes, pais);
-- Nota: desercion12 cruza egresos de TODOS los meses en una ventana de 12 meses;
-- por eso egresos se consulta por rango de 'mes', no solo por el mes actual.

-- ============ Ausencias / Vacaciones / Extras / Capacitación / Merma / Terceros ============
create table if not exists public.ind_ausencias (
  id bigint generated always as identity primary key,
  cedula text, mes text not null references public.ind_meses(mes) on delete cascade,
  pais text not null references public.ind_paises(nombre),
  nombre text, departamento text, tipo text, dias numeric default 0
);
create table if not exists public.ind_vacaciones (
  id bigint generated always as identity primary key,
  cedula text, mes text not null references public.ind_meses(mes) on delete cascade,
  pais text not null references public.ind_paises(nombre),
  nombre text, departamento text, area text, dias numeric default 0
);
create table if not exists public.ind_extras (
  id bigint generated always as identity primary key,
  cedula text, mes text not null references public.ind_meses(mes) on delete cascade,
  pais text not null references public.ind_paises(nombre),
  nombre text, departamento text, area text, horas numeric default 0
);
create table if not exists public.ind_capacitacion (
  id bigint generated always as identity primary key,
  mes text not null references public.ind_meses(mes) on delete cascade,
  pais text not null references public.ind_paises(nombre),
  area_conocimiento text, curso text, horas numeric default 0, participantes numeric default 0
);
create table if not exists public.ind_merma (
  id bigint generated always as identity primary key,
  mes text not null references public.ind_meses(mes) on delete cascade,
  pais text not null references public.ind_paises(nombre),
  area text, cantidad numeric default 0
);
create table if not exists public.ind_terceros (
  id bigint generated always as identity primary key,
  mes text not null references public.ind_meses(mes) on delete cascade,
  pais text not null references public.ind_paises(nombre),
  cantidad numeric default 0
);
-- areas NO lleva país en el sistema actual (COLMAP.areas = [grupo, area, colaboradores])
create table if not exists public.ind_areas (
  id bigint generated always as identity primary key,
  mes text not null references public.ind_meses(mes) on delete cascade,
  grupo text, area text, colaboradores numeric default 0
);

-- ============ Parámetros por mes/país ============
-- Los ~40 params incluyen arrays (hc_indet[5], hc_det[5], suc_p45[5]) y escalares
-- heterogéneos. Se guardan como JSONB tipado para no crear 40 columnas y preservar
-- exactamente la forma que compute() espera. La capa de ensamblaje valida el shape.
create table if not exists public.ind_parametros_mes (
  mes    text not null references public.ind_meses(mes) on delete cascade,
  pais   text not null references public.ind_paises(nombre),
  params jsonb not null default '{}'::jsonb,
  primary key (mes, pais)
);

-- ============ Config global ============
create table if not exists public.ind_config_metas    ( kpi text primary key, a numeric, b numeric );
create table if not exists public.ind_config_leaders   ( area text primary key, lider text, correo text );
create table if not exists public.ind_config_kpi_off   ( kpi text primary key );
create table if not exists public.ind_config_satisfaccion ( anio int primary key, valor numeric );
create table if not exists public.ind_config_kv         ( key text primary key, value text );  -- sysUrl, etc.

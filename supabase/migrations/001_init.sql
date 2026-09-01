-- ============================================================
-- OLO · Indicadores de Personal
-- Migración: crea SOLO una tabla nueva y exclusiva de este proyecto.
-- ------------------------------------------------------------
-- ⚠️ IMPORTANTE: este script NO toca ninguna tabla existente.
-- No modifica olo_kv, olo_movilidad_kv, olo_organigramas_kv ni
-- olo_salida_kv (esas son de otros proyectos y tienen data real).
--
-- Este proyecto usa UNA sola tabla propia con el mismo patrón KV
-- que el resto de la suite OLO:
--   olo_indicadores_kv
--     key        text        -> clave lógica ("__cfg", "2026-07", ...)
--     value      jsonb       -> documento JSON del registro
--     updated_at timestamptz -> última actualización (automática)
-- ============================================================

-- Tabla exclusiva de este proyecto (no interfiere con las demás)
create table if not exists public.olo_indicadores_kv (
  key        text primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists olo_indicadores_kv_value_gin
  on public.olo_indicadores_kv using gin (value);

-- Trigger de updated_at SOLO para esta tabla.
-- Usamos un nombre de función propio para no pisar funciones existentes.
create or replace function public.olo_indicadores_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_olo_indicadores_kv_updated on public.olo_indicadores_kv;
create trigger trg_olo_indicadores_kv_updated
  before update on public.olo_indicadores_kv
  for each row execute function public.olo_indicadores_set_updated_at();

-- RLS solo sobre esta tabla nueva
alter table public.olo_indicadores_kv enable row level security;

drop policy if exists olo_indicadores_kv_all on public.olo_indicadores_kv;
create policy olo_indicadores_kv_all
  on public.olo_indicadores_kv
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ============================================================
-- OLO · Indicadores de Personal — SEED de autenticación (opcional)
-- ------------------------------------------------------------
-- Crea un usuario administrador inicial para poder entrar y luego
-- registrar al resto de usuarios desde el módulo.
--
--   email:    admin@olo.com
--   password: admin123   (CAMBIALA tras el primer ingreso)
--
-- Hash: PBKDF2-SHA256, 100000 iteraciones, 32 bytes.
-- Escribe SOLO en olo_indicadores_usuarios / olo_indicadores_roles.
-- ============================================================

-- Asegura que exista el rol admin (por si no se corrió 002_auth.sql)
insert into public.olo_indicadores_roles (id, nombre, scope, pais) values
  ('admin', 'Administrador', 'admin', null)
on conflict (id) do nothing;

insert into public.olo_indicadores_usuarios (email, nombre, rol_id, pass_hash, pass_salt)
values (
  'admin@olo.com',
  'Administrador',
  'admin',
  'cd274f7b1076d10db6f2280cef1915d9990a6e8690ae17867e5c6906dba91854',
  'ae73e6a85df31cf48f12fa240a537df6'
)
on conflict (email) do nothing;

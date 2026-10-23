-- ============================================================
-- OLO · Indicadores de Personal — SEED de ejemplo
-- ------------------------------------------------------------
-- Escribe SOLO en la tabla nueva public.olo_indicadores_kv.
-- No toca ninguna otra tabla existente.
--
-- Formato KV (igual al de tus otras tablas): key / value(jsonb).
-- Las claves siguen el patrón de la app (index.html guarda
-- localStorage["olo_master_db"] = objeto DB):
--   key = "__cfg"     -> configuración (metas, líderes, sysUrl)
--   key = "YYYY-MM"   -> datos del mes (activos, egresos, ...)
-- ============================================================

-- Configuración global (__cfg)
insert into public.olo_indicadores_kv (key, value) values
('__cfg', jsonb_build_object(
  'metas', '{}'::jsonb,
  'sysUrl', '',
  'kpiOff', '[]'::jsonb,
  'leaders', jsonb_build_array(
    jsonb_build_object('area','Personal','lider','Ana Rivas','correo','ana.rivas@olo.com'),
    jsonb_build_object('area','Seguridad y Salud Laboral','lider','Carlos Peña','correo','carlos.pena@olo.com'),
    jsonb_build_object('area','Servicios Generales','lider','Marta Solís','correo','marta.solis@olo.com')
  )
))
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Mes 2026-07 con colaboradores, un egreso, una ausencia, capacitación y parámetros
insert into public.olo_indicadores_kv (key, value) values
('2026-07', jsonb_build_object(
  'activos', jsonb_build_array(
    jsonb_build_object(
      'pais','Costa Rica','nombre','Juan Pérez','departamento','Ventas','area','Ventas',
      'sexo','Masculino','fecha_nacimiento','1990-05-14','fecha_ingreso','2020-03-01',
      'nivel','N1','nivel_educativo','Universitario','carrera','Administración',
      'movilidad','M2','movimiento','Promoción','tipo','Indeterminado','paso','2',
      'vac_disfrutadas',3,'vac_pendientes',12
    ),
    jsonb_build_object(
      'pais','Costa Rica','nombre','Laura Vargas','departamento','Personal','area','Personal',
      'sexo','Femenino','fecha_nacimiento','1988-11-02','fecha_ingreso','2019-06-15',
      'nivel','N3','nivel_educativo','Posgrado','carrera','Psicología',
      'movilidad','M5','movimiento','Ascenso','tipo','Indeterminado','paso','5',
      'vac_disfrutadas',5,'vac_pendientes',8
    ),
    jsonb_build_object(
      'pais','Guatemala','nombre','Pedro Ramírez','departamento','Logistica In','area','Centro de Distribución',
      'sexo','Masculino','fecha_nacimiento','1995-02-20','fecha_ingreso','2023-01-10',
      'nivel','N1','nivel_educativo','Secundaria','carrera','',
      'movilidad','M1','movimiento','Sin cambio','tipo','Determinado','paso','1',
      'vac_disfrutadas',2,'vac_pendientes',4
    ),
    jsonb_build_object(
      'pais','El Salvador','nombre','Sofía Núñez','departamento','Sistemas','area','Sistemas',
      'sexo','Femenino','fecha_nacimiento','1992-08-30','fecha_ingreso','2021-09-01',
      'nivel','N2','nivel_educativo','Universitario','carrera','Ingeniería en Sistemas',
      'movilidad','M4','movimiento','Sin cambio','tipo','Indeterminado','paso','3',
      'vac_disfrutadas',4,'vac_pendientes',6
    )
  ),
  'egresos', jsonb_build_array(
    jsonb_build_object(
      'pais','Costa Rica','nombre','María Gómez','departamento','Logistica In',
      'motivo','Renuncia','fecha_ingreso','2024-08-10','fecha_salida','2026-06-15',
      'movilidad','M5','recomienda','Sí'
    )
  ),
  'ausencias', jsonb_build_array(
    jsonb_build_object('pais','Costa Rica','nombre','Luis Mora','departamento','Sistemas','tipo','Incapacidad CCSS','dias',3)
  ),
  'areas', '[]'::jsonb,
  'capacitacion', jsonb_build_array(
    jsonb_build_object('pais','Costa Rica','area_conocimiento','Seguridad y salud','curso','Manejo de montacargas','participantes',22,'horas',16)
  ),
  'extras', '[]'::jsonb,
  'vacaciones', '[]'::jsonb,
  'merma', '[]'::jsonb,
  'terceros', '[]'::jsonb,
  'params', jsonb_build_object(
    'hc_indet', jsonb_build_array(0,0,0,0,0),
    'hc_det',   jsonb_build_array(0,0,0,0,0),
    'suc_p45',  jsonb_build_array(0,0,0,0,0),
    'vac_dias',0,'vac_cant',0,'vac_fecha','',
    'of_realizadas',10,'of_rechazadas',2,'of_descartados',5,'of_contactados',40,
    'rot_ini',0,'rot_egr',0,'des_egr12',0,'des_ing12',0,'dias_habiles',21,
    'nuevos',0,'prom_colab',0,'colab_vac',0,'mant_cierre',0,
    'accidentes',0,'capacitados',22,'incidentes',0,'colab_accid',0,'mant_plan',0,'ot_dias',0,
    'encuesta',4.2,'fecha_ult_accidente','2026-03-12','accid_area','Centro de Distribución',
    'ruta_basicas',0,'ruta_tecnicas',0,'ruta_liderazgo',0
  )
))
on conflict (key) do update set value = excluded.value, updated_at = now();

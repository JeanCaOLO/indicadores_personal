# Implementation Plan: indicadores-app

## Overview

Plan de implementación incremental para migrar el sistema monolítico (`out/index.html`) a Next.js (App Router) + TypeScript + Supabase, siguiendo el diseño.

El ordenamiento prioriza el **núcleo crítico**: primero se exportan fixtures "golden" del sistema actual, luego se porta el **motor de indicadores** módulo por módulo, y recién después se valida la **paridad numérica** (tolerancia 1e-6; exacto para `int`) y las **correctness properties** con tests de propiedad (fast-check). La UI, la base de datos normalizada, la migración de datos, la autenticación/RLS y el import/export se construyen sobre un motor ya probado. La **paridad visual pixel-por-pixel** se trata como requisito duro: extracción de CSS/variables 1:1 y componentización fiel.

`out/index.html` es la **fuente de verdad** y permanece intacto durante todo el plan.

Convenciones del plan:
- Las subtareas marcadas con `*` son tests o pulido opcional (se omiten para un MVP funcional equivalente, pero no la paridad del motor).
- Las subtareas marcadas con `_(Opcional)_` son pulido no imprescindible para un primer sistema funcional equivalente.
- Cada subtarea referencia los requisitos que satisface con `_Requirements: X.Y_`.
- Cada test de propiedad referencia la propiedad del diseño con el formato `**Property N: ...**` y `**Validates: Requirements ...**`.

## Tasks

- [x] 1. Scaffolding del proyecto Next.js
  - [x] 1.1 Crear el proyecto Next.js (App Router + TypeScript) en la carpeta nueva `indicadores-app`
    - Inicializar `indicadores-app/` hermana de `out/`, con App Router, TypeScript estricto, ESLint; `out/index.html` queda intacto
    - Crear `package.json`, `tsconfig.json`, `next.config.ts`
    - Instalar dependencias: `@supabase/supabase-js`, `@supabase/ssr`, `xlsx`, `jspdf`, `jspdf-autotable`
    - Instalar dependencias de desarrollo/test: `fast-check`, `vitest` (runner de PBT)
    - _Requirements: 16.2_

  - [x] 1.2 Crear la estructura de carpetas del diseño y archivos placeholder
    - Crear `app/` (con `(auth)/login`, `(app)/{dashboard,administrar,corporativa,comparativa,usuarios}`, `api/`), `core/`, `components/`, `lib/{supabase,data,io,auth}`, `supabase/{migrations,migrate}`, `test/{fixtures,parity,property}`
    - Crear `.env.local.example` documentando `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; `.env.local` ignorado por git
    - _Requirements: 16.3_

  - [x] 1.3 Configurar el runner de tests (Vitest) y los scripts npm
    - Añadir `vitest.config.ts` con rutas `test/parity` y `test/property`
    - Añadir scripts `test`, `test:parity`, `test:property` en `package.json` (usar ejecución única, sin modo watch)
    - _Requirements: 18.1_

- [x] 2. Exportar fixtures golden desde el sistema actual (fuente de verdad)
  - [x] 2.1 Exportar el snapshot de datos `olo_indicadores_kv`
    - Volcar `select key, value from olo_indicadores_kv` a `test/fixtures/db.snapshot.json` (incluye meses `YYYY-MM` y `__cfg`)
    - No modificar `out/index.html` ni la base; es solo lectura
    - _Requirements: 18.1, 15.1_

  - [x] 2.2 Generar el golden de KPIs calculados por el sistema actual
    - Con una rutina temporal y aislada que use la lógica de `out/index.html` (sin alterar el archivo fuente), para cada mes con datos y cada país (`__all__`, `Costa Rica`, `Venezuela`), volcar `compute(k).ind`, `compute(k).raw` y `accValue(itk,k)` de los 29 KPIs, con `TODAY` fijado a una fecha constante, a `test/fixtures/expected-kpis.json`
    - Registrar la fecha constante usada (se reutiliza como `ctx.today` en los tests de paridad)
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

- [x] 3. Tipos del dominio en TypeScript
  - [x] 3.1 Implementar `core/types.ts`
    - Definir `MonthKey`, `Pais`, `PaisScope`, `Sexo`, `Movilidad`, `NivelEducativo`, `Movimiento`, `TipoContrato`, `MotivoEgreso`
    - Definir `Colaborador` (con `id` = cédula), `Egreso`, `Ausencia`, `Vacacion`, `Extra`, `Capacitacion`, `Merma`, `Tercero`, `Area`, `ParametrosMes`, `MesData`, `ConfigGlobal`, `ConfigDB`
    - Definir `KpiType`, `KPI`, `Grupo`, `Rol`, `Perfil`, `ComputeContext`, `ComputeResult`
    - _Requirements: 1.1, 1.3, 11.5_

- [x] 4. Port del motor de indicadores (TypeScript puro, sin DOM)
  - [x] 4.1 Portar `core/kpi-defs.ts` (definiciones de los 29 KPIs y grupos)
    - Portar `KPI[]`, `KMAP`, `ACC_RATIO`, `ACC_SUM`, `SRC`, `NIV`, `MSHORT`, `MLONG`, `MONTHS`/`monthsOf`, `mi`, `yOf` con los mismos valores del sistema actual
    - Preservar para cada KPI su clave, nombre, unidad, tipo, dirección `lower`, flag `info`/`esl` y umbrales `[a,b]`
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 4.2 Escribir tests de ejemplo para `kpi-defs`
    - Verificar que existen exactamente los 29 KPIs con sus claves y que cada uno mapea a su grupo correcto
    - _Requirements: 1.1, 1.2_

  - [x] 4.3 Portar `core/dates.ts`
    - Portar `asofFor`, `yearsBetween`, `bizDaysInMonth`, `isBiz`, `nthBizDay`, `lastDay`, `addBiz`, `bizBetween`, `fmtDate` preservando la aritmética exacta (`365.25*864e5`, redondeos, descarte de rangos inválidos)
    - _Requirements: 4.1, 4.2_

  - [ ]* 4.4 Escribir property test para `dates` (edad/antigüedad)
    - **Property 9: El promedio de edad y antigüedad está acotado por sus extremos**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 4.5 Portar `core/format.ts`
    - Portar `pct`, `fmt`, `nfmt` con el formato `es-CR` idéntico al actual
    - _Requirements: 1.4_

  - [x] 4.6 Portar `core/semaphore.ts`
    - Portar `sem`, `eslBand`, `kpiValid`, `meta` (override de `cfg.metas`), preservando la lógica `lower`/no-`lower` y los cortes ESL 3.88 / 4.02 / 4.29 / 4.43
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 4.7 Escribir property test para clasificación de semáforo
    - **Property 4: Clasificación de semáforo determinista y monótona**
    - **Validates: Requirements 2.1**

  - [ ]* 4.8 Escribir property test para bandas ESL
    - **Property 5: Bandas ESL de satisfacción deterministas y monótonas**
    - **Validates: Requirements 2.4**

  - [x] 4.9 Portar `core/desercion.ts`
    - Portar `desercion12` (ventana de 12 meses `start=new Date(y,mo-12,1)`, `end=new Date(y,mo,0)`, egresos con `0<=t<1` año) y `lastAccidentDate`/`lastAccidentInfo` con el comportamiento literal del código actual
    - _Requirements: 4.4, 4.5_

  - [ ]* 4.10 Escribir property test para deserción de primer año
    - **Property 10: La deserción de primer año cuenta solo egresos de antigüedad menor a un año**
    - **Validates: Requirements 4.4**

  - [ ]* 4.11 Escribir property test para días sin accidentes
    - **Property 11: Los días sin accidentes son no negativos y monótonos**
    - **Validates: Requirements 4.5**

  - [x] 4.12 Portar `core/accumulate.ts`
    - Portar `accValue` y `valOf` (acumulado solo sobre meses con `hasData` desde enero; ACC_RATIO suma `[num,den]` por separado y luego `safe`; ACC_SUM suma numeradores; resto snapshot)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 4.13 Escribir property test para acumulado ACC_RATIO
    - **Property 6: Acumulado ACC_RATIO es la razón de sumas e independiente del orden**
    - **Validates: Requirements 3.2**

  - [ ]* 4.14 Escribir property test para acumulado ACC_SUM
    - **Property 7: Acumulado ACC_SUM es la suma de numeradores y monótono no decreciente**
    - **Validates: Requirements 3.3**

  - [ ]* 4.15 Escribir property test para acumulado de KPI no acumulable
    - **Property 8: Acumulado de KPI no acumulable es el snapshot mensual**
    - **Validates: Requirements 3.4**

  - [x] 4.16 Portar `core/compute.ts` (núcleo del motor)
    - Portar `compute(k, db, ctx)`, `rosterInfo` y helpers `sum`, `safe`, `nivIdx`, `hasData`, `M`, `meta`, `kpiOn`
    - Convertir todos los globales (`DB`, `PAIS`, `DEP`, `AREA`, `CUR`, `VIEW`, `TODAY`) en parámetros/`ComputeContext`
    - Preservar los detalles sutiles del diseño: `safe(n,d)=d>0?n/d:0`; precedencia manual vs. lista (`nuevos`, `rot_ini`, `des_ing12`, `des_egr12`); `movimStatus` → `null`; `mant_prev` normaliza `%`; `encuesta` con precedencia param→cfg por año; `merma_hurto`; `diasSinAcc`; roster sin arrastre; distribuciones (sexo, nivel educativo, carrera, movilidad M1–M7, depto, área) y horas hombre ordinarias/extras
    - _Requirements: 1.4, 1.5, 1.6, 3.1, 4.3, 4.6, 4.7_

  - [ ]* 4.17 Escribir property test para ratios con denominador cero
    - **Property 2: Ratios con denominador cero son finitos y valen 0**
    - **Validates: Requirements 1.5**

  - [ ]* 4.18 Escribir property test para precedencia de fuente de datos
    - **Property 3: Precedencia determinista de la fuente de datos**
    - **Validates: Requirements 1.6, 4.7**

  - [ ]* 4.19 Escribir property test para partición de horas hombre
    - **Property 12: Las horas hombre se particionan sin pérdida**
    - **Validates: Requirements 4.6**

  - [ ]* 4.20 Escribir tests de ejemplo para precedencia y bordes ESL
    - Tabla de verdad de los ternarios de precedencia (manual vs. lista); casos ESL en los bordes exactos (3.88, 4.02, 4.29, 4.43); `desercion12` cruzando años
    - _Requirements: 1.6, 2.4, 4.4, 4.7_

- [x] 5. Checkpoint - Motor portado
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Validación de paridad numérica contra el golden
  - [x] 6.1 Implementar el cargador de fixtures y el comparador con tolerancias
    - Leer `db.snapshot.json` y `expected-kpis.json`; comparador: `int` igualdad exacta, `pct`/`days`/`num` dentro de 1e-6, `null` solo si el golden es `null`
    - Fijar `ctx.today` a la fecha constante usada al generar el golden
    - _Requirements: 18.2, 18.3_

  - [x] 6.2 Implementar el test de paridad numérica model-based (motor vs. golden)
    - Por cada (mes, país, KPI, modo mensual/acumulado), comparar el valor del motor portado contra el golden, incluyendo valores derivados (edad, antigüedad, deserción, días sin accidente, horas hombre)
    - **Property 1: Paridad numérica con el sistema actual (model-based)**
    - **Validates: Requirements 1.4, 18.1, 18.2, 18.3, 18.4**

  - [ ]* 6.3 Benchmark de rendimiento del cálculo
    - Medir que `compute` de los 29 KPIs de un mes con volumen real completa en ≤ 500 ms sobre el fixture
    - _Requirements: 17.2_

- [x] 7. Esquema de base de datos normalizado (migraciones SQL)
  - [x] 7.1 Crear la migración de esquema `supabase/migrations/010_schema.sql`
    - Crear catálogos `ind_paises`, `ind_meses`; snapshot `ind_colaboradores` (PK compuesta cédula+mes+país) con índices; `ind_egresos`, `ind_ausencias`, `ind_vacaciones`, `ind_extras`, `ind_capacitacion`, `ind_merma`, `ind_terceros`, `ind_areas`
    - Crear `ind_parametros_mes` (`params` JSONB, PK mes+país) y tablas de config `ind_config_metas`, `ind_config_leaders`, `ind_config_kpi_off`, `ind_config_satisfaccion`, `ind_config_kv`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 7.2 Crear la migración de roles/perfiles `supabase/migrations/012_profiles_auth.sql`
    - Crear `ind_roles` (`scope` in global/pais/admin, `pais`) e `ind_perfiles` (FK a `auth.users`, `rol_id`, `activo`)
    - Crear la función `ind_user_scope()` (`security definer`) que resuelve scope+país del usuario autenticado
    - _Requirements: 13.5, 14.2, 14.3_

  - [x] 7.3 Crear la migración de RLS `supabase/migrations/011_rls.sql`
    - Habilitar RLS y crear policies SELECT y write por país en todas las tablas de datos con columna `pais` (global ve todo; pais solo su país; admin no ve data)
    - Policy de `ind_areas` (sin país) y policy de gestión de `ind_perfiles`/`ind_roles` para scope admin/global
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 7.4 Generar los tipos de Supabase `supabase/types.ts`
    - Generar los tipos del esquema normalizado para tipar la capa de datos
    - _Requirements: 11.1_

- [x] 8. Script de migración de datos kv → normalizado
  - [x] 8.1 Implementar el cliente admin y la limpieza de meses basura
    - Crear `lib/supabase/admin.ts` (`service_role`, solo servidor)
    - Portar `limpiarMesesVacios()` para descartar las claves `YYYY-MM` sin registros, sin parámetros no nulos, sin arrays de nivel con datos y sin `fecha_ult_accidente`
    - _Requirements: 15.1_

  - [x] 8.2 Implementar la migración de Config_Global en `supabase/migrate/migrate-data.ts`
    - Descomponer `__cfg` en `ind_config_metas` (una fila por KPI con `[a,b]`), `ind_config_leaders`, `ind_config_kpi_off`, `ind_config_satisfaccion` (por año) e `ind_config_kv` (`sysUrl`)
    - _Requirements: 15.3_

  - [x] 8.3 Implementar la migración de meses, países, entidades y parámetros
    - Poblar `ind_meses`/`ind_paises`; por cada `YYYY-MM` insertar `activos`, `egresos`, `ausencias`, `vacaciones`, `extras`, `capacitacion`, `merma`, `terceros`, `areas` con su `mes` y `pais`, preservando cédula y todos los campos; guardar `value.params` en `ind_parametros_mes` (JSONB) por país
    - Hacer el script idempotente (truncar tablas `ind_*` de datos al inicio o `on conflict` en catálogos)
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ]* 8.4 Escribir test de integración de la migración (paridad end-to-end)
    - Ejecutar la migración sobre `db.snapshot.json`, correr el motor sobre las tablas normalizadas y verificar paridad contra `expected-kpis.json`
    - _Requirements: 15.4_

- [x] 9. Capa de acceso a datos
  - [x] 9.1 Implementar los clientes Supabase cliente y servidor
    - Crear `lib/supabase/client.ts` (browser, anon) y `lib/supabase/server.ts` (server client con cookies para SSR y RLS)
    - _Requirements: 13.1_

  - [x] 9.2 Implementar el ensamblaje `lib/data/assemble.ts`
    - Implementar `assembleMesData` (filas normalizadas → `MesData`) y `assembleDB` (agrupa por mes → `ConfigDB` con la misma forma que el `DB` original); `normalizeParams` garantiza arrays de 5 y defaults
    - _Requirements: 11.3, 17.1_

  - [x] 9.3 Implementar las consultas `lib/data/queries.ts`
    - Implementar `loadMes`, `loadDB` (año completo + meses previos requeridos para `desercion12`), `loadConfig`, aplicando RLS por el server client
    - _Requirements: 13.1, 17.1_

  - [x] 9.4 Implementar las escrituras `lib/data/writes.ts`
    - Implementar `replaceByPais` (borra solo las filas del país en el mes e inserta las nuevas; conserva otros países), equivalente a `ingestReplace`
    - _Requirements: 6.5_

  - [ ]* 9.5 Escribir tests de integración de RLS por país
    - Verificar que `scope='pais'` recibe cero filas de otro país, `scope='global'` ve ambos, `scope='admin'` no ve data pero gestiona usuarios
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 10. Autenticación con Supabase Auth, guard de sesión y RBAC
  - [x] 10.1 Implementar sesión y RBAC en `lib/auth/`
    - Implementar `session.ts` (`getSession`, `requireAuth` que redirige a `/login`) y `rbac.ts` (`resolvePaisScope`, `canManageUsers`, `canSeeData`)
    - _Requirements: 12.2, 12.4, 13.5_

  - [x] 10.2 Implementar el middleware de refresco de sesión y la pantalla de login
    - Crear `app/middleware.ts` (refresca la sesión y redirige a `/login` si no hay)
    - Implementar `app/(auth)/login/page.tsx` con `signInWithPassword`, manejo de credenciales válidas/inválidas y logout
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 10.3 Implementar el script de migración/creación de usuarios `supabase/migrate/migrate-users.ts`
    - Migrar roles a `ind_roles`; crear usuarios en Supabase Auth con `admin.createUser` (sin la contraseña antigua PBKDF2) usando invitación/reset de contraseña; crear `ind_perfiles` vinculando `auth.users.id` ↔ `rol_id`, preservando scope y país
    - _Requirements: 15.5_

  - [ ]* 10.4 Escribir tests de integración de autenticación
    - Login con credenciales válidas/inválidas, logout y bloqueo de acceso sin sesión
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

- [x] 11. Checkpoint - Datos, migración y auth
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Paridad visual: estilos base, fuentes y layout
  - [x] 12.1 Portar `app/globals.css` con las variables `:root` 1:1
    - Extraer del `out/index.html` la paleta de colores, radios, sombras y estilos de componente y portarlos con los mismos valores a `globals.css`
    - _Requirements: 16.1_

  - [x] 12.2 Configurar las tipografías con `next/font` en `app/layout.tsx`
    - Cargar Inter y Space Grotesk con los mismos pesos y usos que el sistema actual; aplicar CSS global y providers
    - _Requirements: 16.2_

  - [x] 12.3 Implementar el layout base del grupo protegido `app/(app)/layout.tsx`
    - Implementar `Header` (logo, acciones, chip de usuario), `FilterBar` (período/país/área/depto) y `PillNav` (5 vistas + segmento de densidad) con el markup y clases equivalentes; integrar el guard de sesión
    - _Requirements: 16.3, 5.5_

  - [ ]* 12.4 Escribir snapshots de paridad visual de layout
    - Snapshots del DOM/CSS de `Header`, `FilterBar`, `PillNav` comparados contra el markup equivalente del sistema actual
    - _Requirements: 16.3, 16.4_

- [x] 13. Componentes de KPI compartidos
  - [x] 13.1 Implementar `KpiCard`, `Semaforo`, `Sparkline` y `EslBadge`
    - Portar `.kpi` (builder `kpiSecHTML`) con valor, delta, target y definición; `.sem`/`.dot`; sparkline `.kpi .spark .b`; `.esl-badge`/`.esl-dot` con `eslBand`
    - Representar KPI no disponible (`na`) e informativo (sin semáforo) igual que el sistema actual
    - _Requirements: 2.2, 2.3, 16.3_

  - [x] 13.2 Implementar `DistTable` y `BarRow`
    - Portar `.card`/`table`/`.bar-row` para distribuciones (sexo, nivel, carrera, movilidad, depto, área)
    - _Requirements: 4.3, 16.3_

  - [ ]* 13.3 Escribir snapshots de paridad visual de componentes de KPI
    - Snapshots de `KpiCard`, `Semaforo`, `Sparkline`, `EslBadge`, `DistTable` contra el markup equivalente del sistema actual
    - _Requirements: 16.4_

- [x] 14. Vistas principales
  - [x] 14.1 Implementar el Dashboard Operativo (`app/(app)/dashboard/page.tsx` + cliente)
    - Server Component que hace `requireAuth`, resuelve `paisScope` y `loadDB`; cliente que monta el motor y renderiza tarjetas por grupo, franja ejecutiva, comparativa por país, horas hombre, gráficos de distribución y sparklines
    - Recalcular en memoria al cambiar período/país/área/depto; fijar y bloquear el país si el scope es `pais`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 17.1_

  - [x] 14.2 Implementar la Vista Corporativa (`app/(app)/corporativa/page.tsx`)
    - Portar `MatrizCorporativa`: matriz anual por mes con la misma estructura de filas/columnas, modo presentación y salida de impresión
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 14.3 Implementar la Vista Comparativa (`app/(app)/comparativa/page.tsx`)
    - Comparación por país (lado a lado) y por año con la misma presentación; restringir a su país si el scope es `pais`
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 14.4 Implementar la Pantalla Usuarios (`app/(app)/usuarios/page.tsx`)
    - CRUD de usuarios y roles con alcance pais/global/admin; permitir solo a scope admin/global; denegar y mostrar permiso insuficiente al resto; exigir correo y contraseña válidos al crear
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 14.5 Escribir snapshots de paridad visual de las vistas
    - Captura pixel-por-pixel de Dashboard, Corporativa, Comparativa y Usuarios con el mismo dataset, comparadas contra el sistema actual
    - _Requirements: 16.4_

- [x] 15. Checkpoint - UI principal
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Importación de archivos (XLSX/CSV) y Plantilla Maestra
  - [x] 16.1 Portar `field-alias.ts`, `colmap.ts` y `normval.ts`
    - Portar `FIELD_ALIAS`, `COLMAP` y `normVal`/`eduCarrera`/`titleCase`/`toISODate`/`NA` (fechas a ISO, sexo a M/F, país, movilidad, nivel educativo) con las mismas reglas
    - _Requirements: 9.2, 9.3_

  - [ ]* 16.2 Escribir property test de normalización del importador
    - **Property 13: La normalización del importador es idempotente y canónica**
    - **Validates: Requirements 9.2, 9.3**

  - [x] 16.3 Portar `parse-rows.ts` y la lectura de la Plantilla Maestra
    - Portar `parseRows`, `headRow`, `resolveIdx`, `idxAnio`, `idxMes`, `monthKeyFrom` (lectura XLSX/XLS/CSV, soporte AÑO/MES) y la lectura de las hojas Activos, Egresos, Incapacidades, Permisos, Vacaciones, Capacitacion, HorasExtra, Terceros, MERMA y las hojas de parámetros (Seleccion, SSL, ServiciosGenerales, PlanAnualBienestar, Satisfacción); cargar `xlsx` con dynamic import
    - Reportar el campo faltante cuando no hay columna reconocible para un campo requerido
    - _Requirements: 9.1, 9.4, 9.5, 9.6_

  - [x] 16.4 Portar `ingest.ts` (reemplazo por país + satisfacción) y conectar con `replaceByPais`
    - Portar `ingestReplace`, `cargaPais`, `applySatisfaccion`; producir objetos normalizados que `replaceByPais` persiste reemplazando solo el país cargado
    - _Requirements: 6.5, 9.4_

  - [x] 16.5 Implementar la Pantalla Administrar y el asistente de carga
    - Portar `renderAdmin`, `CargaWizard`, `MasterUpload`, `ParamGrid`, `EditableTable`: asistente de carga mensual, carga de Plantilla Maestra en un archivo, descarga de plantillas por tipo, edición manual de registros y de `ParametrosMes` por área
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 17. Exportación a Excel y PDF
  - [x] 17.1 Portar el exportador a Excel (`lib/io/export/xlsx.ts`)
    - Portar `exportOperativaMes` (columnas/contenido del mes) y `exportOperativaAnio` (una columna por mes) y `masterTemplate` (descarga de plantillas); cargar `xlsx` con dynamic import
    - _Requirements: 10.1, 10.2, 6.3_

  - [x] 17.2 Portar el exportador a PDF (`lib/io/export/pdf.ts`)
    - Portar `downloadPDFOperativa` (PDF operativa) y `downloadPDF` (PDF corporativa) preservando contenido y disposición; cargar `jspdf` y `jspdf-autotable` con dynamic import
    - _Requirements: 10.3, 10.4_

  - [ ]* 17.3 Escribir tests de ejemplo de import/export
    - Parseo de la Plantilla Maestra con todas sus hojas y mensajes de error del importador (campo faltante)
    - _Requirements: 9.4, 9.6_

- [x] 18. Integración, validación end-to-end y despliegue
  - [x] 18.1 Cablear todas las piezas y verificar el flujo completo
    - Conectar login → middleware → vistas → motor → import/export sobre los datos migrados; verificar que no queda código huérfano y que cada vista recalcula al cambiar filtros
    - _Requirements: 5.4, 17.1_

  - [ ]* 18.2 Validación de paridad end-to-end contra el sistema actual
    - Comparar números (vía la suite de paridad del motor sobre los datos migrados) y snapshots visuales de las vistas contra `out/index.html` con el mismo dataset
    - _Requirements: 16.4, 18.1_

  - [~] 18.3 _(Opcional)_ Preparar el despliegue
    - Configurar `next build` y las variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` solo servidor) para el hosting
    - _Requirements: 16.1_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las subtareas marcadas con `*` son opcionales (tests y pulido) y pueden omitirse para un MVP más rápido; la paridad del motor (tareas 4 y 6) no debe omitirse.
- Las subtareas marcadas con `_(Opcional)_` son pulido no imprescindible para un primer sistema funcional equivalente.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Los checkpoints aseguran validación incremental.
- Los property tests validan las 13 correctness properties del diseño (fast-check, ≥100 iteraciones, `ctx.today` fijo).
- Los tests unitarios/ejemplo validan casos concretos y bordes.
- El orden prioriza el motor y su paridad numérica antes de construir la UI.
- `out/index.html` permanece intacto: es la fuente de verdad para fixtures y comparación.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["4.1", "4.3", "4.5"] },
    { "id": 4, "tasks": ["4.2", "4.4", "4.6", "4.9"] },
    { "id": 5, "tasks": ["4.7", "4.8", "4.10", "4.11", "4.12"] },
    { "id": 6, "tasks": ["4.13", "4.14", "4.15", "4.16"] },
    { "id": 7, "tasks": ["4.17", "4.18", "4.19", "4.20", "6.1"] },
    { "id": 8, "tasks": ["6.2", "6.3", "7.1", "7.2"] },
    { "id": 9, "tasks": ["7.3", "7.4", "8.1"] },
    { "id": 10, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 11, "tasks": ["8.4", "9.2", "9.3", "9.4", "12.1", "12.2"] },
    { "id": 12, "tasks": ["9.5", "10.1", "12.3", "13.1", "13.2"] },
    { "id": 13, "tasks": ["10.2", "10.3", "12.4", "13.3", "16.1"] },
    { "id": 14, "tasks": ["10.4", "14.1", "14.2", "14.3", "14.4", "16.2", "16.3"] },
    { "id": 15, "tasks": ["14.5", "16.4", "17.1", "17.2"] },
    { "id": 16, "tasks": ["16.5", "17.3", "18.1"] },
    { "id": 17, "tasks": ["18.2", "18.3"] }
  ]
}
```

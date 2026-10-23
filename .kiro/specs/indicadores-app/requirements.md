# Requirements Document

## Introduction

Este documento define los requisitos para migrar el sistema "Indicadores de Personal · OLO" desde su implementación monolítica actual (un único archivo `out/index.html` de ~2440 líneas con HTML, CSS y ~150 funciones JavaScript inline) hacia una nueva arquitectura basada en Next.js (React) + TypeScript con backend Supabase.

El sistema actual es la fuente de verdad del comportamiento y la apariencia. La migración debe reproducir fielmente todo el comportamiento existente: el motor de 29 indicadores (KPIs) en 7 grupos, los tres modos de vista de valor (mensual, acumulado, comparativo), las cinco pantallas (Dashboard operativo, Administrar datos, Vista Corporativa, Vista Comparativa, Gestión de usuarios), la importación y exportación de Excel/CSV/PDF, y la apariencia visual.

Los cambios de arquitectura respecto del sistema actual son: (a) base de datos Supabase normalizada en lugar del esquema actual clave/valor (`olo_indicadores_kv`), usando la cédula del colaborador como clave natural por persona; (b) autenticación real con Supabase Auth en lugar del login casero basado en hash PBKDF2 en tabla propia; (c) control de acceso por país aplicado con Row Level Security (RLS) en el servidor, de modo que un usuario de un país no pueda leer datos de otro país ni siquiera en su navegador; y (d) migración de los datos reales existentes al nuevo esquema normalizado.

El proyecto nuevo reside en una carpeta nueva `indicadores-app`, hermana del proyecto actual. El sistema actual (`out/index.html`) no se modifica y permanece intacto.

Un criterio de aceptación transversal y obligatorio es la paridad visual pixel-por-pixel con el sistema actual, y la paridad numérica: para los mismos datos de entrada, los valores calculados de cada KPI en el sistema migrado deben coincidir con los del sistema actual.

## Glossary

- **Sistema**: El sistema migrado "Indicadores de Personal · OLO" implementado en Next.js + TypeScript + Supabase.
- **Sistema_Actual**: La implementación monolítica existente en `out/index.html`, que sirve como fuente de verdad del comportamiento y la apariencia.
- **Motor_De_Indicadores**: El componente del Sistema que calcula el valor de cada KPI a partir de los datos de un mes.
- **KPI**: Indicador de desempeño. Cada KPI tiene clave única, nombre, unidad, tipo (pct, int, days, num), dirección (`lower=true` significa que un valor menor es mejor), umbrales de semáforo `[a,b]` y una definición/fórmula.
- **Grupo_KPI**: Agrupación temática de KPIs. Los siete grupos son Rotación, Reclutamiento y Selección, Ausentismo y bienestar, Capacitación, Desarrollo, Seguridad y Salud Laboral, y Servicios Generales.
- **Semaforo**: Clasificación visual de un valor de KPI en verde (ok), amarillo (warn) o rojo (danger) según sus umbrales y su dirección.
- **Modo_Mensual**: Modo de vista de valor que muestra el snapshot del mes seleccionado.
- **Modo_Acumulado**: Modo de vista de valor que muestra ratios o sumas acumuladas desde enero hasta el mes seleccionado, con lógica ACC_RATIO (suma de numeradores ÷ suma de denominadores) o ACC_SUM (suma de numeradores) según el KPI.
- **Modo_Comparativo**: Modo de vista que compara valores entre dos años o entre países.
- **Dashboard_Operativo**: Pantalla que muestra los KPIs del mes en tarjetas con semáforos, sparklines, franja ejecutiva, comparativa por país, horas hombre y gráficos de distribución.
- **Pantalla_Administrar**: Pantalla de carga y administración de datos (asistente de carga mensual, carga maestra, plantillas, edición manual, parámetros por área).
- **Vista_Corporativa**: Pantalla de matriz anual estilo reporte, con modo presentación e impresión.
- **Vista_Comparativa**: Pantalla que compara indicadores por país o por año.
- **Pantalla_Usuarios**: Pantalla de gestión (CRUD) de usuarios y roles.
- **Colaborador**: Persona activa registrada; su clave natural es la cédula (campo `id`).
- **Cedula**: Número de identificación del Colaborador; clave natural por persona en el esquema normalizado.
- **Pais**: País al que pertenece un conjunto de datos. Los países actuales son Costa Rica y Venezuela.
- **Rol**: Perfil de acceso con un alcance (`scope`). Los alcances son `global`, `pais` y `admin`.
- **Scope_Global**: Alcance de Rol que permite ver la data de todos los países, con selector de país disponible.
- **Scope_Pais**: Alcance de Rol que permite ver únicamente la data de un país, con el filtro de país fijado y bloqueado.
- **Scope_Admin**: Alcance de Rol que permite gestionar usuarios pero no ver la data de indicadores.
- **RLS**: Row Level Security de Supabase/PostgreSQL, que restringe las filas accesibles a cada usuario en el servidor.
- **Supabase_Auth**: El servicio de autenticación de Supabase que reemplaza el login casero actual.
- **Importador**: El componente del Sistema que lee archivos Excel (.xlsx/.xls) y CSV y mapea sus columnas a campos del Sistema.
- **FIELD_ALIAS**: El conjunto de alias de encabezados de columna reconocidos por el Importador para cada campo.
- **Plantilla_Maestra**: Archivo Excel con múltiples hojas (Activos, Egresos, Incapacidades, Permisos, Vacaciones, Capacitacion, HorasExtra, Terceros, MERMA) y hojas de parámetros (Seleccion, SSL, ServiciosGenerales, PlanAnualBienestar, Satisfacción).
- **Exportador**: El componente del Sistema que genera archivos Excel y PDF a partir de los indicadores.
- **Parametros_Mes**: Conjunto de ~40 parámetros numéricos por mes que alimentan KPIs sin lista detallada.
- **Config_Global**: Configuración global del Sistema (metas por KPI, líderes/correos por área, URL del sistema, KPIs desactivados, satisfacción anual).
- **Escala_ESL**: Escala de satisfacción laboral de 0 a 5 usada por el KPI de encuesta, con bandas de color.
- **Paridad_Visual**: Correspondencia pixel-por-pixel entre la interfaz del Sistema y la del Sistema_Actual (colores, tipografías Inter y Space Grotesk, layout, tarjetas, semáforos, vistas).
- **Paridad_Numerica**: Correspondencia entre los valores de KPI calculados por el Sistema y los del Sistema_Actual para los mismos datos de entrada.

## Requirements

### Requirement 1: Paridad del motor de indicadores (29 KPIs en 7 grupos)

**User Story:** Como responsable de Recursos Humanos, quiero que el sistema migrado calcule los mismos 29 indicadores organizados en los mismos 7 grupos, para que la información de gestión no cambie al migrar de plataforma.

#### Acceptance Criteria

1. THE Motor_De_Indicadores SHALL exponer los 29 KPIs con las claves `rot_total`, `rot_renuncia`, `rot_despido`, `rot_indeseada`, `dias_vacante`, `nuevos`, `desercion`, `descarte`, `efectividad`, `ausentismo`, `vac_cobertura`, `encuesta`, `cap_horas`, `cap_hxc`, `cap_cursos`, `promo`, `ascenso`, `sucesion`, `dias_sin_acc`, `record_dias`, `accidentes`, `colab_accid_n`, `merma_hurto`, `mant_plan`, `mant`, `ot_dias` y `mant_prev`.
2. THE Motor_De_Indicadores SHALL asignar cada KPI a su Grupo_KPI según la correspondencia del Sistema_Actual: Rotación, Reclutamiento y Selección, Ausentismo y bienestar, Capacitación, Desarrollo, Seguridad y Salud Laboral, y Servicios Generales.
3. THE Motor_De_Indicadores SHALL asociar a cada KPI su unidad, su tipo (`pct`, `int`, `days` o `num`), su dirección `lower` y sus umbrales de semáforo `[a,b]` con los mismos valores que el Sistema_Actual.
4. WHEN un KPI se calcula con los mismos datos de entrada que en el Sistema_Actual, THE Motor_De_Indicadores SHALL producir un valor numérico igual al del Sistema_Actual.
5. IF el denominador de un KPI de tipo ratio es cero, THEN THE Motor_De_Indicadores SHALL devolver el mismo valor que el Sistema_Actual devuelve en ese caso.
6. WHERE un KPI tiene disponible tanto una lista detallada como un valor manual de Parametros_Mes, THE Motor_De_Indicadores SHALL seleccionar la fuente de datos siguiendo la misma precedencia que el Sistema_Actual.

### Requirement 2: Semáforos y clasificación de valores

**User Story:** Como gerente, quiero que cada indicador muestre el mismo color de semáforo que el sistema actual, para interpretar el desempeño de la misma forma.

#### Acceptance Criteria

1. WHEN THE Motor_De_Indicadores clasifica un valor de KPI, THE Sistema SHALL asignar la banda verde, amarilla o roja usando los umbrales `[a,b]` y la dirección `lower` del KPI con la misma lógica que el Sistema_Actual.
2. IF un KPI no tiene valor disponible para el período seleccionado, THEN THE Sistema SHALL mostrarlo como no disponible con la misma representación visual que el Sistema_Actual.
3. WHERE un KPI está marcado como informativo (sin umbrales de semáforo), THE Sistema SHALL mostrarlo sin clasificación de color de semáforo.
4. WHEN el KPI de satisfacción laboral se clasifica, THE Sistema SHALL aplicar las bandas de la Escala_ESL (0–5) con los mismos cortes de color que el Sistema_Actual.

### Requirement 3: Modos de vista de valor (mensual, acumulado, comparativo)

**User Story:** Como analista, quiero alternar entre vista mensual, acumulada y comparativa, para analizar los indicadores en distintas perspectivas igual que en el sistema actual.

#### Acceptance Criteria

1. WHEN el usuario selecciona el Modo_Mensual, THE Motor_De_Indicadores SHALL devolver el valor snapshot del mes seleccionado.
2. WHEN el usuario selecciona el Modo_Acumulado para un KPI incluido en la lógica ACC_RATIO, THE Motor_De_Indicadores SHALL sumar los numeradores y los denominadores de enero hasta el mes seleccionado y devolver su cociente.
3. WHEN el usuario selecciona el Modo_Acumulado para un KPI incluido en la lógica ACC_SUM, THE Motor_De_Indicadores SHALL devolver la suma de los numeradores de enero hasta el mes seleccionado.
4. WHEN el usuario selecciona el Modo_Acumulado para un KPI que no está en ACC_RATIO ni en ACC_SUM, THE Motor_De_Indicadores SHALL devolver el valor snapshot del mes seleccionado.
5. WHEN el usuario selecciona el Modo_Comparativo, THE Sistema SHALL mostrar la comparación entre años o entre países con la misma presentación que el Sistema_Actual.

### Requirement 4: Cálculos derivados del perfil de colaboradores

**User Story:** Como responsable de Recursos Humanos, quiero que las métricas derivadas del listado de colaboradores se calculen igual que hoy, para mantener la consistencia del perfil de la plantilla.

#### Acceptance Criteria

1. WHEN THE Motor_De_Indicadores procesa el listado de activos de un mes, THE Motor_De_Indicadores SHALL calcular la edad promedio a partir de la fecha de nacimiento respecto de la fecha de corte del mes con el mismo método que el Sistema_Actual.
2. WHEN THE Motor_De_Indicadores procesa el listado de activos de un mes, THE Motor_De_Indicadores SHALL calcular la antigüedad promedio a partir de la fecha de ingreso respecto de la fecha de corte del mes con el mismo método que el Sistema_Actual.
3. THE Motor_De_Indicadores SHALL calcular la distribución por sexo, por nivel educativo, por carrera, por movilidad (M1–M7), por departamento y por área con los mismos agrupamientos que el Sistema_Actual.
4. WHEN THE Motor_De_Indicadores calcula la deserción de primer año, THE Motor_De_Indicadores SHALL contar los egresos con antigüedad menor a un año sobre los ingresos en la ventana de 12 meses con el mismo método que el Sistema_Actual.
5. WHEN existe fecha del último accidente, THE Motor_De_Indicadores SHALL calcular los días sin accidentes como los días transcurridos entre esa fecha y la fecha de corte del mes.
6. THE Motor_De_Indicadores SHALL calcular las horas hombre ordinarias y extras por categoría con la misma agregación que el Sistema_Actual.
7. WHEN se consulta la satisfacción laboral anual, THE Motor_De_Indicadores SHALL resolver su valor con la misma precedencia (parámetro del mes, luego Config_Global por año) que el Sistema_Actual.

### Requirement 5: Dashboard Operativo

**User Story:** Como gerente, quiero el mismo dashboard operativo con tarjetas, semáforos y gráficos, para revisar los indicadores del mes como lo hago hoy.

#### Acceptance Criteria

1. THE Dashboard_Operativo SHALL mostrar los KPIs del período seleccionado en tarjetas agrupadas por Grupo_KPI con la misma disposición que el Sistema_Actual.
2. THE Dashboard_Operativo SHALL mostrar la franja ejecutiva, la comparativa por país, las horas hombre y los gráficos de distribución con el mismo contenido que el Sistema_Actual.
3. THE Dashboard_Operativo SHALL mostrar un sparkline por KPI con la misma serie temporal que el Sistema_Actual.
4. WHEN el usuario cambia el filtro de período, país, área o departamento, THE Dashboard_Operativo SHALL recalcular y volver a mostrar los indicadores según ese filtro.
5. WHILE el Rol del usuario tiene Scope_Pais, THE Dashboard_Operativo SHALL fijar el filtro de país al país del Rol y bloquear su modificación.

### Requirement 6: Pantalla Administrar datos y carga

**User Story:** Como coordinador de país, quiero cargar y editar los datos del mes como en el sistema actual, para mantener los indicadores actualizados.

#### Acceptance Criteria

1. THE Pantalla_Administrar SHALL ofrecer un asistente de carga del mes con los mismos pasos que el Sistema_Actual.
2. THE Pantalla_Administrar SHALL permitir la carga de una Plantilla_Maestra con múltiples hojas en un solo archivo.
3. THE Pantalla_Administrar SHALL ofrecer la descarga de plantillas por tipo con las mismas columnas que el Sistema_Actual.
4. THE Pantalla_Administrar SHALL permitir la edición manual de registros en tablas y la edición de los Parametros_Mes por área.
5. WHEN un usuario con Scope_Pais carga datos de un mes, THE Sistema SHALL reemplazar únicamente los registros de su país dentro de ese mes y conservar los registros de los demás países.

### Requirement 7: Vista Corporativa

**User Story:** Como directivo, quiero la vista corporativa anual estilo reporte con modo presentación e impresión, para exponer los resultados igual que hoy.

#### Acceptance Criteria

1. THE Vista_Corporativa SHALL mostrar una matriz anual de indicadores por mes con la misma estructura de filas y columnas que el Sistema_Actual.
2. WHERE el usuario activa el modo presentación, THE Vista_Corporativa SHALL mostrar la matriz en formato de presentación con la misma apariencia que el Sistema_Actual.
3. WHEN el usuario solicita imprimir, THE Vista_Corporativa SHALL generar una salida de impresión con el mismo formato que el Sistema_Actual.

### Requirement 8: Vista Comparativa

**User Story:** Como analista, quiero comparar indicadores por país o por año, para identificar diferencias igual que en el sistema actual.

#### Acceptance Criteria

1. WHEN el usuario selecciona comparación por país, THE Vista_Comparativa SHALL mostrar los indicadores de cada país lado a lado para el período seleccionado.
2. WHEN el usuario selecciona comparación por año, THE Vista_Comparativa SHALL mostrar los indicadores de los años comparados con la misma presentación que el Sistema_Actual.
3. WHILE el Rol del usuario tiene Scope_Pais, THE Vista_Comparativa SHALL restringir la comparación a los datos del país del Rol.

### Requirement 9: Importación de archivos Excel y CSV

**User Story:** Como coordinador de país, quiero importar archivos Excel y CSV con encabezados flexibles, para cargar datos sin reformatear mis archivos.

#### Acceptance Criteria

1. THE Importador SHALL leer archivos en formato .xlsx, .xls y CSV.
2. WHEN el Importador procesa los encabezados de una columna, THE Importador SHALL mapear la columna al campo correspondiente usando el conjunto FIELD_ALIAS con los mismos alias que el Sistema_Actual.
3. WHEN el Importador lee valores de fecha, sexo, país, movilidad y nivel educativo, THE Importador SHALL normalizarlos (fechas a formato ISO, sexo a M/F y las demás categorías) con las mismas reglas que el Sistema_Actual.
4. WHEN el Importador procesa una Plantilla_Maestra, THE Importador SHALL leer las hojas Activos, Egresos, Incapacidades, Permisos, Vacaciones, Capacitacion, HorasExtra, Terceros y MERMA y las hojas de parámetros Seleccion, SSL, ServiciosGenerales, PlanAnualBienestar y Satisfacción.
5. WHEN una hoja incluye columnas de AÑO y MES, THE Importador SHALL asignar cada fila al mes correspondiente para permitir carga actual e histórica.
6. IF un archivo importado no contiene una columna reconocible para un campo requerido, THEN THE Importador SHALL informar el campo faltante al usuario.

### Requirement 10: Exportación a Excel y PDF

**User Story:** Como gerente, quiero exportar los indicadores a Excel y PDF, para compartir reportes igual que en el sistema actual.

#### Acceptance Criteria

1. WHEN el usuario solicita la exportación a Excel de los indicadores del mes, THE Exportador SHALL generar un archivo Excel con las mismas columnas y contenido que el Sistema_Actual.
2. WHEN el usuario solicita la exportación a Excel de los indicadores del año, THE Exportador SHALL generar un archivo Excel con una columna por mes y el mismo contenido que el Sistema_Actual.
3. WHEN el usuario solicita la exportación a PDF de la vista operativa, THE Exportador SHALL generar un PDF con el mismo contenido y disposición que el Sistema_Actual.
4. WHEN el usuario solicita la exportación a PDF de la vista corporativa, THE Exportador SHALL generar un PDF con el mismo contenido y disposición que el Sistema_Actual.

### Requirement 11: Modelo de datos normalizado

**User Story:** Como mantenedor del sistema, quiero un esquema de base de datos normalizado con tablas reales, para consultar y gobernar los datos de forma estructurada en lugar del esquema clave/valor actual.

#### Acceptance Criteria

1. THE Sistema SHALL almacenar los datos en tablas relacionales normalizadas en lugar del esquema clave/valor del Sistema_Actual.
2. THE Sistema SHALL usar la Cedula del Colaborador como clave natural por persona.
3. THE Sistema SHALL representar las entidades por mes activos, egresos, ausencias, vacaciones, horas extra, capacitación, merma, terceros, áreas y Parametros_Mes como tablas o registros relacionados por mes y por país.
4. THE Sistema SHALL representar la Config_Global (metas por KPI, líderes y correos por área, URL del sistema, KPIs desactivados y satisfacción por año) en el esquema normalizado.
5. THE Sistema SHALL conservar, para cada registro de colaborador, los campos país, nombre, departamento, área, sexo, fecha de nacimiento, fecha de ingreso, nivel, nivel educativo, carrera, movilidad, movimiento, tipo, paso, vacaciones disfrutadas y vacaciones pendientes.

### Requirement 12: Autenticación con Supabase Auth

**User Story:** Como usuario del sistema, quiero iniciar sesión con autenticación real, para que el acceso sea seguro y no dependa del login casero actual.

#### Acceptance Criteria

1. THE Sistema SHALL autenticar a los usuarios mediante Supabase_Auth en lugar del login casero basado en hash PBKDF2 del Sistema_Actual.
2. WHEN un usuario envía credenciales válidas, THE Sistema SHALL iniciar su sesión y cargar su Rol asociado.
3. IF un usuario envía credenciales inválidas, THEN THE Sistema SHALL rechazar el acceso y mostrar un mensaje de error.
4. WHILE un usuario no ha iniciado sesión, THE Sistema SHALL impedir el acceso a las pantallas de datos y solicitar autenticación.
5. WHEN un usuario cierra sesión, THE Sistema SHALL finalizar su sesión y requerir autenticación para volver a acceder.

### Requirement 13: Control de acceso por país con RLS

**User Story:** Como responsable de seguridad, quiero que el acceso a los datos por país se aplique en el servidor, para que un usuario de un país no pueda recibir datos de otro país en su navegador.

#### Acceptance Criteria

1. WHILE un usuario autenticado tiene un Rol con Scope_Pais, THE Sistema SHALL devolver desde el servidor únicamente las filas del país de ese Rol mediante RLS.
2. WHERE un usuario tiene un Rol con Scope_Global, THE Sistema SHALL permitir el acceso a los datos de todos los países y habilitar el selector de país.
3. WHERE un usuario tiene un Rol con Scope_Admin, THE Sistema SHALL permitir la gestión de usuarios e impedir el acceso a los datos de indicadores.
4. IF un usuario solicita filas de un país distinto al de su Rol con Scope_Pais, THEN THE Sistema SHALL excluir esas filas en el servidor antes de enviarlas al navegador.
5. THE Sistema SHALL definir los alcances de Rol `global`, `pais` y `admin` con el mismo significado que el Sistema_Actual.

### Requirement 14: Gestión de usuarios y roles

**User Story:** Como administrador, quiero gestionar usuarios y roles, para controlar quién accede al sistema y con qué alcance.

#### Acceptance Criteria

1. WHERE el usuario tiene Scope_Admin o Scope_Global, THE Pantalla_Usuarios SHALL permitir crear, editar y eliminar usuarios.
2. THE Pantalla_Usuarios SHALL permitir asignar un Rol a cada usuario.
3. THE Pantalla_Usuarios SHALL permitir crear y eliminar roles con alcance `pais`, `global` o `admin`.
4. IF un usuario sin Scope_Admin ni Scope_Global abre la Pantalla_Usuarios, THEN THE Sistema SHALL denegar la gestión de usuarios y mostrar un mensaje de permiso insuficiente.
5. WHEN un administrador crea un usuario, THE Sistema SHALL requerir correo y contraseña válidos antes de crearlo.

### Requirement 15: Migración de los datos reales existentes

**User Story:** Como responsable de Recursos Humanos, quiero que los datos reales actuales se migren al nuevo esquema, para no perder el histórico ni volver a cargarlo.

#### Acceptance Criteria

1. THE Sistema SHALL migrar los datos existentes de Costa Rica y de Venezuela desde el esquema clave/valor actual al esquema normalizado.
2. WHEN se migra un registro de colaborador, THE Sistema SHALL preservar su Cedula y todos sus campos asociados sin pérdida de información.
3. WHEN se migra la Config_Global, THE Sistema SHALL preservar las metas por KPI, los líderes y correos por área, la URL del sistema, los KPIs desactivados y la satisfacción por año.
4. WHEN se calculan los KPIs sobre los datos migrados, THE Motor_De_Indicadores SHALL producir los mismos valores que el Sistema_Actual producía sobre los datos originales.
5. THE Sistema SHALL migrar los usuarios existentes y sus roles conservando su alcance y su país.

### Requirement 16: Paridad visual pixel-por-pixel

**User Story:** Como usuario del sistema, quiero que la interfaz migrada se vea idéntica a la actual, para no tener que reaprender la herramienta.

#### Acceptance Criteria

1. THE Sistema SHALL reproducir la paleta de colores, los radios, las sombras y los estilos de componente del Sistema_Actual con los mismos valores.
2. THE Sistema SHALL usar las tipografías Inter y Space Grotesk con los mismos pesos y usos que el Sistema_Actual.
3. THE Sistema SHALL reproducir el layout del encabezado, la barra de filtros, la navegación por pestañas, las tarjetas de KPI, los semáforos y las cinco pantallas con la misma disposición que el Sistema_Actual.
4. WHEN una pantalla del Sistema se compara con la pantalla equivalente del Sistema_Actual con los mismos datos, THE Sistema SHALL presentar una correspondencia visual pixel-por-pixel.

### Requirement 17: Rendimiento del cálculo y de las vistas

**User Story:** Como usuario del sistema, quiero que los indicadores se calculen y muestren con rapidez, para trabajar sin esperas.

#### Acceptance Criteria

1. WHEN el usuario cambia de período, país, área o departamento en el Dashboard_Operativo, THE Sistema SHALL recalcular y mostrar los indicadores en un tiempo no mayor al percibido en el Sistema_Actual para el mismo volumen de datos.
2. WHEN THE Motor_De_Indicadores calcula todos los KPIs de un mes, THE Sistema SHALL completar el cálculo en 500 ms o menos para un volumen de datos equivalente al del Sistema_Actual.
3. WHEN el usuario importa una Plantilla_Maestra, THE Importador SHALL procesar el archivo y reportar el resultado sin bloquear la interfaz de forma perceptible.

### Requirement 18: Paridad numérica verificable

**User Story:** Como responsable de Recursos Humanos, quiero poder verificar que los números del sistema nuevo coinciden con los del actual, para confiar en la migración.

#### Acceptance Criteria

1. THE Sistema SHALL calcular cada uno de los 29 KPIs, en Modo_Mensual y en Modo_Acumulado, con un valor igual al del Sistema_Actual para el mismo conjunto de datos de entrada.
2. WHEN se comparan los valores de un KPI de tipo `pct`, `days` o `num` entre el Sistema y el Sistema_Actual, THE Sistema SHALL coincidir dentro de una tolerancia de 1e-6.
3. WHEN se comparan los valores de un KPI de tipo `int` entre el Sistema y el Sistema_Actual, THE Sistema SHALL coincidir exactamente.
4. THE Sistema SHALL calcular los valores derivados de edad promedio, antigüedad promedio, deserción de primer año, días sin accidentes y horas hombre con un valor igual al del Sistema_Actual dentro de una tolerancia de 1e-6.

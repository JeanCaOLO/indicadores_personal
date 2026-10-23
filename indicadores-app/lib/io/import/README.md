# lib/io/import

Importación XLSX/XLS/CSV de la Plantilla Maestra.

## Módulos

- `field-alias.ts` — `FIELD_ALIAS`, `resolveIdx`, `idxAnio`, `idxMes` (alias de encabezados, 16.1).
- `colmap.ts` — `COLMAP` y `ColmapKind` (columnas por tipo de hoja, 16.1).
- `normval.ts` — `normVal`, `eduCarrera`, `toISODate`, `NA` (normalización de valores, 16.1).
- `parse-rows.ts` — `parseRows`, `headRow`, `monthKeyFrom` (matriz → objetos, soporte AÑO/MES, reporte de campo faltante Req 9.6; 16.3).
- `read-workbook.ts` — lectura de archivo con `xlsx` (dynamic import) y ruteo de las hojas de la Plantilla Maestra; `applySatisfaccion`, `classifySheet` (16.3).

## parse-rows.ts (16.3)

`parseRows(kind, mat, opts)` porta la lógica del `out/index.html`. Los globals
`CUR`/`PAIS`/`ROLE` del index se pasan como opciones (`ParseOptions`):

- `mesActual` ← `CUR` (clave de mes por defecto).
- `paisCarga` ← `cargaPais()` (país que completa filas sin país para usuario global).
- `rolPais` ← `ROLE` (si ≠ `"__all__"`, se FUERZA ese país — "carga por país").

Devuelve `{ kind, rows, faltantes }`; `rows` conserva la forma `[{ key, o }]` del
index y `faltantes` lista los campos requeridos sin columna reconocible (Req 9.6).

## read-workbook.ts (16.3)

- `readWorkbookSheets(input)` / `readFileToSheets(file)` — leen XLSX/XLS/CSV con
  `const XLSX = await import("xlsx")` (dynamic import) y `sheet_to_json(ws,{header:1,raw:true})`.
- `routeMasterSheets(sheets, opts)` / `readMasterWorkbook(input, opts)` — rutean
  las hojas por nombre normalizado (`NA`): Activos, Egresos, Incapacidades+Permisos
  (→ ausencias, se concatenan), Vacaciones, Capacitacion, HorasExtra (→ extras),
  Terceros, MERMA; hojas de parámetros (Seleccion, SSL, ServiciosGenerales,
  PlanAnualBienestar, Ruta) expuestas crudas para el ParamGrid (16.5); Satisfacción
  vía `applySatisfaccion`; fallback por contenido con `classifySheet`.
- `readSingleSheet(input, kind, opts)` — lee un archivo de una sola hoja como `kind`.

NO escribe a Supabase: produce `{ entidades: { kind → { porMes } }, parametros,
satisfaccion, horasHombre, faltantes, ... }`. La persistencia (reemplazo por país,
`replaceByPais`) es la tarea 16.4.

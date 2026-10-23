# components/admin — Pantalla Administrar (tarea 16.5)

Componentes que portan `renderAdmin` de `out/index.html` (fuente de verdad) con
paridad de markup/clases. El CSS ya vive en `app/globals.css` (`.adm-head`,
`.period`, `.autobox`, `.adm-sec`/`.adm-step`, `.up-grid`/`.up-card`/`.up-head`/
`.up-status`/`.up-actions`, `.dc-edit`/`.dc-tbl`, `.param-grid`/`.fld`/`.lvlrow`,
`.mini`/`.mini.save`, `.banner`).

## Archivos

- **admin-constants.ts** — datos puros portados del index: `COLMAP` (columnas por
  entidad), listas de opciones de los `<select>` (`DEPTS`, `AREAS`, `MOTIVOS`,
  `CONTRATO`, `AUSTIPOS`, `SEXOS`, `EDUC`, `MOVILM`, `MOVIMIENTO`, `PAISES`,
  `AREAS_CONOC`, `NUM_COLS`), `PGROUPS` (grupos de `ParametrosMes`) y `CARDS`
  (metadata de las tarjetas por tipo).

- **AdminClient.tsx** (`"use client"`) — raíz. Encabezado + `.period`
  (selector mes/año/país que navega por URL) + `.autobox`, el **CargaWizard**
  (3 pasos + drop-area), la **carga maestra** (MasterUpload), las **tarjetas por
  tipo** (`DataCard`) y el **ParamGrid**.

- **EditableTable.tsx** — tabla editable de los registros de un tipo
  (`cellInput` del index): `<select>`/number/date/texto por columna, agregar/
  eliminar fila y guardar.

- **ParamGrid.tsx** — edición de `ParametrosMes` por grupo (paramCard +
  param-grid): numérico / porcentaje (×100) / fecha / texto, con guardar.

## Arquitectura

- `app/(app)/administrar/page.tsx` — SERVER COMPONENT: `requireAuth`, lee
  `searchParams` (mes/anio/pais), `loadMes(mes)` para mostrar los registros
  existentes, resuelve el país efectivo (scope `pais` lo fija) y pasa todo al
  `AdminClient`. Dinámica bajo `cacheComponents` (lee cookies + `connection()`);
  no usa `export const dynamic`.

- `app/(app)/administrar/actions.ts` — SERVER ACTIONS (`"use server"`):
  `subirMaestra`, `subirTipo`, `guardarRegistros`, `guardarParametros`,
  `limpiarMesesVacios`. Cada una valida el scope (admin no carga data) y fuerza
  el país correcto (`cargaPais`/`paisScope`), de modo que un usuario de país solo
  puede cargar SU país. El archivo se recibe como `FormData` (File) y se pasa a
  `readMasterWorkbook`/`readSingleSheet` (dynamic import de `xlsx` en el server).

## Dependencia con 17.1 (export de plantillas)

La descarga de plantillas usa `masterTemplate({ mes })` y `dlTpl(kind, { mes })`
de `lib/io/export/xlsx` (tarea 17.1). Son funciones CLIENT-SIDE (arman el
workbook y disparan la descarga con Blob/`document`), así que se invocan desde
`AdminClient` con **dynamic import** (`import("../../lib/io/export/xlsx")`)
envuelto en try/catch: si 17.1 aún no estuviera presente, se avisa al usuario y
el resto de la pantalla sigue funcionando. Al integrarse 17.1, los botones de
descarga quedan funcionales sin cambios aquí.

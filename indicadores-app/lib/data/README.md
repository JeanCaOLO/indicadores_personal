# lib/data

Capa de acceso a datos: `assemble.ts`, `queries.ts`, `writes.ts`. Se implementa en la tarea 9.

- `writes.ts` (tarea 9.4): `replaceByPais(kind, mes, pais, rows, sb)` — reemplazo por país
  (equivalente a `ingestReplace`): borra solo las filas de `(mes, pais)` de la entidad e
  inserta las nuevas, conservando otros países. `upsertParams(mes, pais, params, sb)` hace
  upsert de los parámetros (onConflict `mes,pais`). Para `activos` (→ `ind_colaboradores`,
  PK `cedula,mes,pais`) sintetiza cédulas `__row_<i>` ante vacías/duplicadas, igual que la
  migración. `ind_areas` no tiene país, por eso no es un `kind` soportado.

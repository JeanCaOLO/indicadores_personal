# Test fixtures

## `db.snapshot.json`

Snapshot de solo lectura de la tabla Supabase `olo_indicadores_kv`
(`select key, value from olo_indicadores_kv`), exportado para la tarea 2.1.

### Formato

Objeto JSON mapeado `{ "<key>": <value>, ... }` que replica la forma del `DB`
del sistema actual (`out/index.html`), donde:

- Las claves de mes `YYYY-MM` mapean al objeto del mes (`activos`, `egresos`,
  `ausencias`, `capacitacion`, `extras`, `vacaciones`, `merma`, `terceros`,
  `areas`, `params`, ...).
- La clave especial `__cfg` mapea a la `Config_Global`
  (`metas`, `kpiOff`, `sysUrl`, `leaders`, `satisfaccion`).

El cargador de fixtures (tarea 6.1) puede usarlo directamente como `DB`:
`DB[key] === value`. Para obtener solo los meses reales, filtrar por
`/^\d{4}-\d{2}$/` excluyendo `__cfg`.

### Contenido actual

- 185 claves totales.
- 184 claves de mes `YYYY-MM` válidas + 1 clave `__cfg`.
- De esos 184 meses, 170 son "meses basura" con años muy futuros (2028–2198),
  cada uno con 1 solo registro. La tarea 8.1 (`limpiarMesesVacios`) los
  descartará; aquí se conservan tal cual vienen de la base.

## `expected-kpis.json`

Golden de los KPIs calculados por el **sistema actual** (`out/index.html`),
generado para la tarea 2.2. Es la **vara de validación de paridad numérica** del
motor portado (tareas 4 y 6): el test de paridad (tarea 6.2) compara el valor del
motor nuevo contra este archivo.

Se genera ejecutando el **motor real** de `out/index.html` dentro de Node (sin
navegador), sin modificar el archivo fuente. Ver `scripts/gen-golden.mjs`.

### Fecha de referencia (`TODAY`)

`TODAY = 2026-10-06T00:00:00.000Z` (constante, documentada en `meta.today`).

Esta misma fecha **debe reutilizarse como `ctx.today`** en los tests de paridad
de la tarea 6, porque los cálculos "as-of" dependen de ella (edad promedio,
antigüedad promedio, días sin accidentes, vacante activa). Se eligió posterior a
todos los meses reales (hasta `2027-09`) para que los cálculos usen el fin de mes
correspondiente y no la fecha del reloj del sistema.

### Estructura

```jsonc
{
  "meta": {
    "today": "2026-10-06T00:00:00.000Z",
    "generatedFrom": "out/index.html",
    "generator": "indicadores-app/scripts/gen-golden.mjs",
    "kpiKeys": [ /* 27 claves del array KPI, en orden de presentación */ ],
    "kpiCount": 27,
    "indKeys": [ /* 33 claves: TODO lo que produce compute(k).ind */ ],
    "indCount": 33,
    "rawKeys": [ /* claves con par [num, den] en compute(k).raw */ ],
    "paises": ["__all__", "Costa Rica", "Venezuela"],
    "months": [ "2025-12", "2026-01", ... "2027-09" ]
  },
  "byMonthPais": {
    "2026-07": {
      "__all__":     { "ind": {…}, "raw": {…}, "acc": {…}, "hcTot": 182, "prom": 187, "edadProm": 31.84, "antigProm": 2.78, "diasSinAcc": 8 },
      "Costa Rica":  { … },
      "Venezuela":   { … }
    },
    …
  }
}
```

Por cada celda `(mes, país)`:

- **`ind`** — `compute(mes).ind`: valor **mensual** (snapshot) de cada indicador.
  Se vuelcan **todas** las claves que produce el motor (33), no solo las 27 del
  array `KPI`. Las ~6 extra (`vacante_activa`, `accid_pct`, `colab_accid_n`,
  `incidentes`, `promo_asc`, …) son derivados que el motor calcula y que la UI
  muestra en franjas/tooltips; se incluyen para no perder ningún valor validable.
- **`raw`** — `compute(mes).raw`: pares `[numerador, denominador]` que alimentan
  el acumulado de los KPIs `ACC_RATIO`/`ACC_SUM`.
- **`acc`** — `accValue(kpi, mes)`: valor **acumulado (YTD)** de cada indicador,
  calculado con la misma lógica del sistema (suma de razones para `ACC_RATIO`,
  suma de numeradores para `ACC_SUM`, snapshot para el resto). Depende de
  `MONTHS = monthsOf(año del mes)` y de `hasData`.
- **Derivados**: `hcTot`, `prom`, `edadProm`, `antigProm`, `diasSinAcc`.

`null` es un valor **significativo** (p. ej. `promo/ascenso/promo_asc` cuando el
campo `movimiento` viene como estado histórico): el comparador de paridad debe
tratarlo como tal (coincide solo si el golden es `null`).

### Cobertura

- Meses: 11 reales con datos (`2025-12`, `2026-01`…`2026-09`, `2027-09`).
  Se excluyen los ~170 "meses basura" de años futuros (2028–2198); el motor los
  ignora igual (`hasData`) y la tarea 8.1 los descarta.
- Países: `__all__` (consolidado), `Costa Rica`, `Venezuela`.
- Indicadores por celda: 33 en `ind`, 33 en `acc`, 15 en `raw`.

### Regenerar

Desde `indicadores-app/` (Node 24; sin red, sin Supabase):

```powershell
node scripts/gen-golden.mjs
```

El script lee `out/index.html` (solo lectura) y `test/fixtures/db.snapshot.json`,
ejecuta el motor real en un sandbox `node:vm` con stubs mínimos de DOM y escribe
`test/fixtures/expected-kpis.json`. Es reproducible y vive en el repo a propósito.

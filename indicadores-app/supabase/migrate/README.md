# supabase/migrate

Scripts de migración kv → normalizado: `migrate-data.ts`, `migrate-users.ts`.

## migrate-data.ts (tareas 8.1 / 8.2 / 8.3)

Descompone el snapshot kv (`olo_indicadores_kv`: clave `__cfg` + una clave
`YYYY-MM` por mes) en el esquema normalizado (`ind_*`).

- 8.1 — `clean.ts`: `limpiarMesesVacios` descarta meses basura.
- 8.2 — `migrateConfig`: descompone `__cfg` en `ind_config_metas`,
  `ind_config_leaders`, `ind_config_kpi_off`, `ind_config_satisfaccion` e
  `ind_config_kv` (`sysUrl`). Idempotente (upsert con `onConflict` en la PK).
- 8.3 — meses, países, entidades y parámetros (pendiente, marcado con `TODO`).

### Fuente de datos

- `fixture` (por defecto): lee `test/fixtures/db.snapshot.json`. No toca la base.
- `supabase`: lee la tabla `olo_indicadores_kv` con el cliente `service_role`.

Se elige con `--source=fixture|supabase` o la env var `MIGRATE_SOURCE`.

### Modo dry-run

`--dry-run` (o `MIGRATE_DRY_RUN=1`) NO escribe en Supabase: solo reporta los
conteos de filas que insertaría por tabla. Útil para validar la lógica.

### Cómo correrlo (Windows / PowerShell, Node 24)

```powershell
# Dry-run con el fixture local (por defecto). No escribe nada.
npx tsx supabase/migrate/migrate-data.ts --dry-run

# Migración real desde el fixture hacia Supabase (requiere env vars).
npx tsx supabase/migrate/migrate-data.ts --source=fixture

# Migración real leyendo el snapshot desde Supabase (tabla kv).
npx tsx supabase/migrate/migrate-data.ts --source=supabase
```

El script requiere `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
(ver `.env.local.example`) salvo en dry-run con fixture, que no toca la base.

> Nota: el runner usa imports sin extensión (convención del toolchain
> Next.js/Vitest, `moduleResolution: bundler`). Ejecútalo con `tsx` (o la
> config de Vitest), no con el stripper nativo de Node, que exige extensiones.

La lógica de `migrateConfig` se verifica en `test/migrate-config.test.ts`
(dry-run sobre el `__cfg` del fixture): 0 metas, 3 leaders, 0 kpiOff,
0 satisfaccion, 1 kv (sysUrl "").

## migrate-users.ts

Migración/creación de usuarios (tarea 10.3).

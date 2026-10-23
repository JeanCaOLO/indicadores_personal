// =============================================================================
// test/migrate-config.test.ts
//
// Verifica la migración de Config_Global (tarea 8.2) de
// `supabase/migrate/migrate-data.ts` en modo dry-run contra el `__cfg` real del
// snapshot (test/fixtures/db.snapshot.json), sin tocar Supabase.
//
// El `__cfg` del fixture tiene:
//   metas: {}        → 0 filas en ind_config_metas
//   kpiOff: []       → 0 filas en ind_config_kpi_off
//   satisfaccion: {} → 0 filas en ind_config_satisfaccion
//   sysUrl: ""       → 1 fila en ind_config_kv (key "sysUrl", value "")
//   leaders: [3]     → 3 filas en ind_config_leaders
// =============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import type { ConfigGlobal } from "../core/types";
import {
  DryRunSink,
  migrateConfig,
} from "../supabase/migrate/migrate-data";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadCfg(): ConfigGlobal {
  const p = join(__dirname, "fixtures", "db.snapshot.json");
  const db = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  return db.__cfg as ConfigGlobal;
}

describe("migrateConfig (dry-run, fixture __cfg)", () => {
  it("produce los conteos reales del fixture", async () => {
    const cfg = loadCfg();
    const sink = new DryRunSink();
    await migrateConfig(cfg, sink);

    expect(sink.counts).toEqual({
      ind_config_metas: 0,
      ind_config_leaders: 3,
      ind_config_kpi_off: 0,
      ind_config_satisfaccion: 0,
      ind_config_kv: 1, // sysUrl
    });
  });

  it("descompone metas, kpiOff, satisfaccion y kv de un __cfg poblado", async () => {
    const cfg: ConfigGlobal = {
      metas: {
        rotacion: [5, 10],
        ausentismo: null, // se omite
        satisfaccion: [4, 4.5],
      },
      leaders: [
        { area: "Personal", lider: "Ana", correo: "ana@olo.com" },
        { area: "SSL", lider: "Carlos", correo: "carlos@olo.com" },
      ],
      sysUrl: "https://sys.olo.com",
      kpiOff: ["merma_hurto", "diasSinAcc"],
      satisfaccion: { "2024": 4.1, "2025": 4.3 },
    };
    const sink = new DryRunSink();
    await migrateConfig(cfg, sink);

    expect(sink.counts).toEqual({
      ind_config_metas: 2, // rotacion + satisfaccion (ausentismo null omitido)
      ind_config_leaders: 2,
      ind_config_kpi_off: 2,
      ind_config_satisfaccion: 2,
      ind_config_kv: 1, // sysUrl
    });
  });

  it("tolera un __cfg vacío sin romper (solo escribe el kv sysUrl)", async () => {
    const cfg = {} as ConfigGlobal;
    const sink = new DryRunSink();
    await migrateConfig(cfg, sink);

    expect(sink.counts).toEqual({
      ind_config_metas: 0,
      ind_config_leaders: 0,
      ind_config_kpi_off: 0,
      ind_config_satisfaccion: 0,
      ind_config_kv: 1, // sysUrl "" por defecto
    });
  });
});

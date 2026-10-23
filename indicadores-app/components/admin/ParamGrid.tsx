// =============================================================================
// components/admin/ParamGrid.tsx  (tarea 16.5)
//
// Edición manual de los `ParametrosMes` por grupo/área (paramCard + param-grid
// del sistema actual). Porta `pin`/`pinpct`/`pdate`/`pintext`: cada campo del
// grupo (PGROUPS) se renderiza como un input numérico, porcentaje, fecha o
// texto según su tipo. Al guardar, delega en `onSave(params)` (server action
// `guardarParametros`).
//
// PORCENTAJES: igual que el index, el input de un campo `pct` muestra el valor
// × 100 (p.ej. 0.85 → "85.0") y al guardar lo divide entre 100. Los numéricos
// y fechas/textos se guardan tal cual.
//
// Paridad de markup/clases: `.up-card`, `.up-head`, `.up-status`, `.up-actions`,
// `.dc-edit` (expandible) y `.param-grid` con `.fld` por campo.
// =============================================================================

"use client";

import { useState } from "react";

import type { ParametrosMes } from "../../core/types";
import { PGROUPS, type ParamField, type ParamGroup } from "./admin-constants";

export interface ParamGridProps {
  /** Parámetros actuales del mes (ya normalizados). */
  params: ParametrosMes;
  /** Guarda todos los parámetros editados (server action). */
  onSave: (params: ParametrosMes) => Promise<void> | void;
  /** Descarga de plantilla por grupo (opcional; depende de 17.1). */
  onPlantilla?: (key: string) => void;
  busy?: boolean;
}

/** ¿El grupo tiene algún dato cargado? (pgLoaded del index). */
function pgLoaded(g: ParamGroup, p: Record<string, unknown>): boolean {
  return g.fields.some((f) =>
    f.t === "date" || f.t === "text" ? !!p[f.k] : (+(p[f.k] as number) || 0) > 0,
  );
}

/** Valor de display de un campo: pct se muestra × 100 con 1 decimal. */
function displayValue(f: ParamField, raw: unknown): string {
  if (f.t === "pct") return (((+(raw as number) || 0) as number) * 100).toFixed(1);
  if (f.t === "date" || f.t === "text") return raw == null ? "" : String(raw);
  const n = +(raw as number);
  return Number.isFinite(n) ? String(n) : "";
}

function GroupCard({
  g,
  params,
  onField,
  onSave,
  onPlantilla,
  busy,
}: {
  g: ParamGroup;
  params: Record<string, unknown>;
  onField: (f: ParamField, value: string) => void;
  onSave: () => void;
  onPlantilla?: (key: string) => void;
  busy?: boolean;
}) {
  const loaded = pgLoaded(g, params);
  return (
    <div className="up-card">
      <div className="up-head">
        <div className="up-ttl">
          <h3>{g.title}</h3>
          <p className="up-note">{g.note}</p>
        </div>
        <span className={`up-status ${loaded ? "on" : ""}`}>
          {loaded ? "✓ con datos" : "sin cargar"}
        </span>
      </div>
      <div className="up-actions">
        <button className="mini" disabled={busy} onClick={() => onPlantilla?.(g.key)}>
          ↓ Plantilla
        </button>
        <button className="mini save" disabled={busy} onClick={onSave}>
          ✓ Guardar
        </button>
      </div>
      <details className="dc-edit">
        <summary>
          Ver / editar manualmente <span className="fchev">▾</span>
        </summary>
        <div className="param-grid" style={{ paddingTop: 12 }}>
          {g.fields.map((f) => (
            <div key={f.k}>
              <label className="fld">
                {f.t === "pct" ? f.l.replace(/\s*\(%\)/, "") : f.l}
              </label>
              <input
                type={f.t === "date" ? "date" : f.t === "text" ? "text" : "number"}
                step={f.t === "num" || f.t === "pct" ? "any" : undefined}
                value={displayValue(f, params[f.k])}
                disabled={busy}
                onChange={(e) => onField(f, e.target.value)}
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export default function ParamGrid({
  params: initial,
  onSave,
  onPlantilla,
  busy,
}: ParamGridProps) {
  const [params, setParams] = useState<Record<string, unknown>>({ ...initial });

  const onField = (f: ParamField, value: string) => {
    setParams((prev) => {
      let v: unknown;
      if (f.t === "pct") v = (+value || 0) / 100;
      else if (f.t === "date" || f.t === "text") v = value;
      else v = +value || 0;
      return { ...prev, [f.k]: v };
    });
  };

  const save = () => onSave(params as unknown as ParametrosMes);

  return (
    <>
      {PGROUPS.map((g) => (
        <GroupCard
          key={g.key}
          g={g}
          params={params}
          onField={onField}
          onSave={save}
          onPlantilla={onPlantilla}
          busy={busy}
        />
      ))}
    </>
  );
}

// =============================================================================
// components/admin/EditableTable.tsx  (tarea 16.5)
//
// Tabla editable de los registros de un tipo (dataCard → .dc-edit/.dc-tbl del
// sistema actual). Porta `cellInput` del index: cada columna se renderiza como
// <select> (listas fijas), <input type=number>, <input type=date> o texto según
// la columna. Permite editar celdas, eliminar filas y agregar filas; al guardar
// delega en `onSave(filas)` (que invoca la server action `guardarRegistros`).
//
// Estado LOCAL: las filas se mantienen en estado del cliente mientras se editan;
// el guardado persiste (reemplazo por país) en la base. Paridad de markup/clases
// con el index (`.adm` table, `.row-del`, `.actset`, `.mini`).
// =============================================================================

"use client";

import { useState } from "react";

import {
  AREAS,
  AREAS_CONOC,
  AUSTIPOS,
  CONTRATO,
  DEPTS,
  EDUC,
  MOTIVOS,
  MOVILM,
  MOVIMIENTO,
  NUM_COLS,
  PAISES,
  SEXOS,
  colLabel,
  type EntKind,
} from "./admin-constants";

export interface EditableTableProps {
  kind: EntKind;
  cols: string[];
  rows: Record<string, string>[];
  /** Guarda las filas actuales (server action). */
  onSave: (filas: Record<string, string>[]) => Promise<void> | void;
  /** Deshabilita los controles mientras hay una operación en curso. */
  busy?: boolean;
}

/** <select> con una opción vacía al inicio (igual que `sel` del index). */
function Select({
  value,
  opts,
  onChange,
  disabled,
}: {
  value: string;
  opts: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {["", ...opts].map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Opciones de <select> por columna (portado de cellInput). `null` ⇒ no select. */
function selectOptions(kind: EntKind, col: string): string[] | null {
  if (col === "motivo") return MOTIVOS;
  if (col === "recomienda") return ["Sí", "No"];
  if (col === "tipo" && kind === "activos") return CONTRATO;
  if (col === "tipo" && kind === "ausencias") return AUSTIPOS;
  if (col === "departamento") return DEPTS;
  if (col === "area" && (kind === "activos" || kind === "extras")) return AREAS;
  if (col === "sexo") return SEXOS;
  if (col === "nivel_educativo") return EDUC;
  if (col === "movilidad") return MOVILM;
  if (col === "movimiento") return MOVIMIENTO;
  if (col === "pais") return PAISES;
  if (col === "area_conocimiento") return AREAS_CONOC;
  return null;
}

export default function EditableTable({
  kind,
  cols,
  rows: initialRows,
  onSave,
  busy,
}: EditableTableProps) {
  const [rows, setRows] = useState<Record<string, string>[]>(
    initialRows.map((r) => ({ ...r })),
  );

  const setCell = (ri: number, col: string, val: string) => {
    setRows((prev) => {
      const next = prev.slice();
      next[ri] = { ...next[ri], [col]: val };
      return next;
    });
  };

  const delRow = (ri: number) =>
    setRows((prev) => prev.filter((_, i) => i !== ri));

  const addRow = () => setRows((prev) => [...prev, {}]);

  const clearRows = () => {
    if (confirm("¿Vaciar esta sección?")) setRows([]);
  };

  const cell = (ri: number, col: string, val: string) => {
    const opts = selectOptions(kind, col);
    if (opts) {
      return (
        <Select
          value={val}
          opts={opts}
          disabled={busy}
          onChange={(v) => setCell(ri, col, v)}
        />
      );
    }
    if (NUM_COLS.includes(col)) {
      return (
        <input
          type="number"
          step="any"
          value={val}
          disabled={busy}
          style={{ width: 78 }}
          onChange={(e) => setCell(ri, col, e.target.value)}
        />
      );
    }
    if (col.startsWith("fecha")) {
      return (
        <input
          type="date"
          value={val}
          disabled={busy}
          onChange={(e) => setCell(ri, col, e.target.value)}
        />
      );
    }
    return (
      <input
        type="text"
        value={val}
        disabled={busy}
        onChange={(e) => setCell(ri, col, e.target.value)}
      />
    );
  };

  return (
    <div className="dc-tbl">
      <table className="adm">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className={NUM_COLS.includes(c) ? "num" : undefined}>
                {colLabel(c)}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {cols.map((c) => (
                <td key={c}>{cell(ri, c, r[c] ?? "")}</td>
              ))}
              <td>
                <button
                  className="row-del"
                  disabled={busy}
                  onClick={() => delRow(ri)}
                  aria-label="Eliminar fila"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: "10px 2px 2px" }}>
        <div className="actset">
          <button className="mini" disabled={busy} onClick={addRow}>
            + Fila
          </button>
          <button className="mini danger" disabled={busy} onClick={clearRows}>
            Vaciar
          </button>
          <button
            className="mini save"
            disabled={busy}
            onClick={() => onSave(rows)}
          >
            ✓ Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// components/tables/DistTable.tsx
//
// Tarjeta de distribución genérica (tarea 13.2). Paridad visual 1:1 con el
// patrón de tarjeta del Sistema_Actual (out/index.html, builder `renderDash`):
//
//   <div class="card">
//     <div class="ch"><h3>${title}</h3>[<span class="hint">${hint}</span>]</div>
//     <div class="cb">${ barList(rows, max, tips, vf) | empty }</div>
//   </div>
//
// Sirve a TODAS las distribuciones del dashboard que son listas {label,value}:
//   - sexo (c.sexoC), nivel educativo (c.educC), carrera (c.carreraC),
//     movilidad M1–M7 (c.movMC), departamento (c.depC), área (c.areaC).
// En el sistema actual cada una se arma como:
//   `<div class="card"><div class="ch"><h3>…</h3>[<span class="hint">…</span>]</div>
//     <div class="cb">${rows.length ? barList(rows, max) : `<div class="empty">…</div>`}</div></div>`
// (ver "Nivel educativo", "Estudios superiores", "Colaboradores por Área", etc.).
//
// DECISIÓN de variantes (documentada por la tarea):
//   El index usa DOS presentaciones para distribuciones:
//     a) filas `.bar-row` (barList)  → la mayoría de las distribuciones de 1
//        dimensión {label,value}: nivel educativo, carrera, área, etc.
//     b) `<table>`                   → las distribuciones de 2 dimensiones /
//        matrices (p. ej. "Por departamento" = depto × sexo × edad, "Movilidad
//        por departamento" = depto × M1–M7). Esas NO son listas {label,value}:
//        tienen varias columnas y una fila `total`, y las arma cada vista con su
//        propio <table> porque su estructura es específica (las implementa la
//        vista 14.x, no este componente genérico).
//   Como TODAS las distribuciones {label,value} del enunciado (sexo, nivel,
//   carrera, movilidad, depto, área) se renderizan con `.bar-row`, la variante
//   por defecto es "bars". Se expone además `variant="table"` (una columna
//   Categoría + valor, con fila Total opcional) para las distribuciones simples
//   que un consumidor prefiera mostrar como tabla, reutilizando el mismo CSS
//   `table`/`tr.total` ya portado. Las matrices multi-columna quedan fuera de
//   este componente por diseño.
//
// Componente de presentación puro: recibe `rows` por props. El dashboard (14.1)
// convierte los objetos {clave:conteo} de compute (c.sexoC, c.educC, c.movMC,
// c.depC, c.areaC, c.carreraC…) a `DistRow[]` ({label,value}) y los ordena.
//
// _Requirements: 4.3, 16.3_
// =============================================================================

import { nfmt } from "@/core/format";
import { BarRow } from "./BarRow";

/** Fila de una distribución de una dimensión. */
export interface DistRow {
  label: string;
  value: number;
  /** Tooltip enriquecido opcional (se pasa a BarRow como data-tip). */
  tip?: string;
}

export interface DistTableProps {
  /** Título de la tarjeta (`.ch h3`). */
  title: string;
  /** Texto de ayuda opcional (`.ch .hint`). Si se omite, no se renderiza. */
  hint?: string;
  /** Filas {label,value}. Si está vacío, se muestra el estado `.empty`. */
  rows: DistRow[];
  /** Presentación: barras (por defecto) o tabla simple. Ver DECISIÓN arriba. */
  variant?: "bars" | "table";
  /** Formateador del valor. Por defecto `nfmt`. */
  format?: (v: number) => string;
  /**
   * Estado vacío. Puede ser:
   *  - string  → `<div class="empty">texto</div>`
   *  - {title, hint?} → `<div class="empty"><b>title</b>hint</div>`
   * Por defecto "Sin datos" (equivalente al markup del sistema actual).
   */
  empty?: string | { title: string; hint?: string };
  /** Muestra la fila Total al pie (solo variante "table"). */
  showTotal?: boolean;
}

/** Suma de valores (replica el `tot` de barList). */
function totalOf(rows: DistRow[]): number {
  return rows.reduce((s, r) => s + (r.value || 0), 0);
}

/** Estado vacío idéntico al `.empty` del sistema actual. */
function EmptyState({ empty }: { empty: NonNullable<DistTableProps["empty"]> }) {
  if (typeof empty === "string") {
    return <div className="empty">{empty}</div>;
  }
  return (
    <div className="empty">
      <b>{empty.title}</b>
      {empty.hint}
    </div>
  );
}

/**
 * Tarjeta de distribución genérica. Renderiza `.card`>`.ch`+`.cb` con una
 * lista de `BarRow` (o una tabla simple) y maneja el estado vacío.
 */
export function DistTable({
  title,
  hint,
  rows,
  variant = "bars",
  format,
  empty = "Sin datos",
  showTotal = false,
}: DistTableProps) {
  const F = format ?? nfmt;
  const hasRows = rows.length > 0;

  // max y total a nivel de lista (como barList: mx = max(valores), tot = suma).
  const max = hasRows ? Math.max(...rows.map((r) => r.value), 0) : 0;
  const total = totalOf(rows);
  // El resaltado "top" solo aplica cuando hay más de una fila (igual que barList:
  // `v===top && rows.length>1`).
  const top = rows.length > 1 ? max : null;

  return (
    <div className="card">
      <div className="ch">
        <h3>{title}</h3>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
      <div className="cb">
        {!hasRows ? (
          <EmptyState empty={empty} />
        ) : variant === "table" ? (
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td style={{ textAlign: "left" }}>{r.label}</td>
                  <td className="num">{F(r.value)}</td>
                </tr>
              ))}
              {showTotal ? (
                <tr className="total">
                  <td style={{ textAlign: "left" }}>Total</td>
                  <td className="num">{F(total)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          rows.map((r) => (
            <BarRow
              key={r.label}
              label={r.label}
              value={r.value}
              max={max}
              total={total}
              isTop={top != null && r.value === top}
              format={F}
              tip={r.tip}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default DistTable;

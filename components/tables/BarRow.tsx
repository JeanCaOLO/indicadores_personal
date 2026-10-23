// =============================================================================
// components/tables/BarRow.tsx
//
// Una fila de barra de distribución (tarea 13.2). Paridad visual 1:1 con el
// builder `barList(rows, mx, tips, vf)` del Sistema_Actual (out/index.html):
//
//   <div class="bar-row"[ title=…]>
//     <span class="bl">${label}</span>
//     <span class="bt"><span class="bf" style="width:${(v/mx)*100}%[;background:var(--deep)]"></span></span>
//     <span class="bv num" style="font-weight:${top?700:600}">${F(v)}</span>
//     <span class="bv num" style="width:48px;color:var(--muted)">${(v/tot*100).toFixed(1)}%</span>
//   </div>
//
// Notas de paridad (idénticas al sistema actual):
//   - El ancho del fill = (value / max) * 100 %  (max = máximo de la lista, ≥1).
//   - La barra MÁS ALTA de la lista (y solo si hay >1 fila) se resalta: el fill
//     usa `background:var(--deep)` y el valor va en `font-weight:700`.
//   - La segunda `.bv` muestra el porcentaje sobre el TOTAL de la lista
//     (value / total * 100, 1 decimal) en color `--muted`.
//   - El `title` por defecto replica el tooltip del sistema actual:
//     "`label`: `F(v)` · `pct`% del total". Si `tip` se provee, se usa como
//     `data-tip` (tooltips enriquecidos), igual que `barList`.
//
// El CSS de `.bar-row`/`.bl`/`.bt`/`.bf`/`.bv` ya está en globals.css (12.1).
//
// Componente de presentación puro: recibe todo por props. El cálculo de
// `max`/`total`/`isTop` lo hace el contenedor `DistTable` (igual que `barList`
// los calcula a nivel de lista), para que cada fila sea consistente.
//
// _Requirements: 4.3, 16.3_
// =============================================================================

import { nfmt } from "@/core/format";

export interface BarRowProps {
  /** Etiqueta de la fila (p. ej. el nombre de la categoría). */
  label: string;
  /** Valor numérico de la fila. */
  value: number;
  /** Máximo de la lista (para calcular el ancho del fill). `barList` usa max(mx,1). */
  max: number;
  /**
   * Total de la lista (para el % sobre el total). Opcional: si se omite se usa
   * `value` como total (el % queda en 100.0% como en `tot=…||1` con un solo ítem).
   */
  total?: number;
  /** Si esta fila es la de mayor valor de la lista (resalta fill + peso). */
  isTop?: boolean;
  /** Formateador del valor. Por defecto `nfmt` (entero con separadores es-CR). */
  format?: (v: number) => string;
  /** Tooltip enriquecido opcional (se emite como `data-tip`, igual que `barList`). */
  tip?: string;
}

/**
 * Una fila de barra. Replica literalmente el markup de `barList`.
 */
export function BarRow({
  label,
  value,
  max,
  total,
  isTop = false,
  format,
  tip,
}: BarRowProps) {
  const F = format ?? nfmt;
  // `barList`: mx = Math.max(mx, 1); tot = suma de valores || 1.
  const mx = Math.max(max, 1);
  const tot = total && total > 0 ? total : value || 1;
  const widthPct = (value / mx) * 100;
  const sharePct = ((value / tot) * 100).toFixed(1);

  // El fill resaltado usa background --deep; el valor va en negrita 700.
  const fillStyle: React.CSSProperties = { width: `${widthPct}%` };
  if (isTop) fillStyle.background = "var(--deep)";

  // `data-tip` cuando hay tooltip enriquecido; si no, `title` por defecto
  // idéntico al de `barList`.
  const tipAttrs = tip
    ? { "data-tip": tip }
    : { title: `${label}: ${F(value)} · ${sharePct}% del total` };

  return (
    <div className="bar-row" {...tipAttrs}>
      <span className="bl">{label}</span>
      <span className="bt">
        <span className="bf" style={fillStyle} />
      </span>
      <span className="bv num" style={{ fontWeight: isTop ? 700 : 600 }}>
        {F(value)}
      </span>
      <span className="bv num" style={{ width: 48, color: "var(--muted)" }}>
        {sharePct}%
      </span>
    </div>
  );
}

export default BarRow;

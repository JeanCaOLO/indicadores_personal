// =============================================================================
// components/Sparkline.tsx
//
// Mini-gráfico de barras (tarea 13.1). Paridad visual 1:1 con el Sistema_Actual
// (out/index.html, builder `kpiSecHTML`). Para un KPI NO-ESL, el spark es:
//
//   series = MONTHS.map(k => ({k, v: k<=CUR ? valOf(it,k) : null}));
//   mx     = Math.max(...series.filter(x=>x.v!=null).map(x=>x.v), it.type==="pct"?.001:1);
//   bars   = series.map(x => x.v==null
//     ? `<div class="b" style="height:4%;opacity:.25" title="…: sin registrar"></div>`
//     : `<div class="b ${x.k===curKey?'cur':''}" style="height:${Math.max(4,(x.v/mx)*100)}%" title="…"></div>`);
//   <div class="spark">${bars}</div>
//
// CSS (globals.css, tarea 12.1):
//   .kpi .spark{display:flex;align-items:flex-end;gap:4px;height:32px;…}
//   .kpi .spark .b{flex:1;…;background:var(--line);…;min-height:2px}
//   .kpi .spark .b.cur{background:var(--teal)}
//
// Componente de PRESENTACIÓN: recibe la serie ya calculada por el dashboard.
// Replica EXACTAMENTE la normalización por el máximo de la serie y el mínimo
// de 4% (y el 4%/opacity .25 para meses sin dato).
//
// La variante ESL (`.spark.esl` con `.esc/.escwrap/.escbar/.escyr`) se maneja
// aparte en EslBadge/KpiCard porque colorea por banda y lleva el año debajo.
//
// _Requirements: 2.2, 2.3, 16.3_
// =============================================================================

export interface SparkPoint {
  /** Clave de la barra (mes "YYYY-MM"); se usa para el tooltip y el `cur`. */
  k: string;
  /** Valor de la barra, o null si el mes no tiene dato registrado. */
  v: number | null;
}

export interface SparklineProps {
  /**
   * Serie ya calculada: valores por mes, con `null` para los meses sin dato.
   * Se puede pasar como `SparkPoint[]` (con claves/tooltips) o como
   * `(number|null)[]` (en cuyo caso se usa `currentIndex` para marcar `cur`).
   */
  series: SparkPoint[] | (number | null)[];
  /** Índice del mes actual (barra `.cur`). Solo se usa si `series` es un array plano. */
  currentIndex?: number;
  /**
   * Clave del mes actual (barra `.cur`) cuando `series` es `SparkPoint[]`.
   * Replica `x.k===curKey` del builder `kpiSecHTML`.
   */
  currentKey?: string;
  /**
   * Tipo de KPI: solo afecta el piso del máximo (pct → 0.001, resto → 1),
   * igual que `it.type==="pct"?.001:1` en el sistema actual.
   */
  type?: string;
  /** Títulos (tooltips) por barra, opcional (paridad con los `title` del index). */
  titles?: (string | undefined)[];
}

/** Normaliza la serie de entrada a `SparkPoint[]`, marcando la barra `cur`. */
function toPoints(
  series: SparkPoint[] | (number | null)[],
  currentIndex?: number
): SparkPoint[] {
  if (series.length === 0) return [];
  const first = series[0] as SparkPoint | number | null;
  const isPointArray = typeof first === "object" && first !== null && "v" in (first as object);
  if (isPointArray) return series as SparkPoint[];
  // Array plano (number|null)[] → la barra `cur` es la de `currentIndex`.
  return (series as (number | null)[]).map((v, i) => ({
    k: currentIndex === i ? "cur" : String(i),
    v,
  }));
}

/**
 * Barras del sparkline. Reproduce el cálculo de altura del Sistema_Actual:
 *   mx = max(valores no nulos, pct?0.001:1);  alto = max(4, (v/mx)*100)%.
 * Meses sin dato → barra fantasma a 4% con opacidad .25.
 */
export function Sparkline({ series, currentIndex, currentKey, type, titles }: SparklineProps) {
  const points = toPoints(series, currentIndex);

  // mx = Math.max(...valoresNoNulos, it.type==="pct"?.001:1)   (paridad exacta)
  const nonNull = points.filter((p) => p.v != null).map((p) => p.v as number);
  const mx = Math.max(...nonNull, type === "pct" ? 0.001 : 1);

  // El mes "actual" (clase .cur): si vino como SparkPoint[], el dashboard ya lo
  // marca poniendo k === curKey; acá soportamos ambas formas comparando contra
  // el índice (array plano) o contra la clave "cur" inyectada por toPoints.
  const curKeyFromIndex = currentIndex != null ? String(currentIndex) : undefined;

  return (
    <div className="spark">
      {points.map((p, i) => {
        const isCur = p.k === "cur" || p.k === curKeyFromIndex || p.k === currentKey;
        const title = titles?.[i];
        if (p.v == null) {
          return (
            <div
              key={i}
              className="b"
              style={{ height: "4%", opacity: 0.25 }}
              title={title}
            />
          );
        }
        const h = Math.max(4, (p.v / mx) * 100);
        return (
          <div
            key={i}
            className={`b ${isCur ? "cur" : ""}`}
            style={{ height: `${h}%` }}
            title={title}
          />
        );
      })}
    </div>
  );
}

export default Sparkline;

// =============================================================================
// components/EslBadge.tsx
//
// Componentes de satisfacción laboral (Escala ESL) — tarea 13.1. Paridad visual
// 1:1 con el Sistema_Actual (out/index.html).
//
// 1) EslBadge / EslDot: badge o punto coloreado por banda ESL (`eslBand(v)`):
//      .esl-badge → font Space Grotesk, texto blanco, fondo = color de banda.
//      .esl-dot   → punto de 12px, fondo = color de banda.
//    CSS (globals.css):
//      .esl-dot{width:12px;height:12px;border-radius:50%;flex:none}
//      .esl-badge{font-family:…;font-weight:700;font-size:12.5px;color:#fff;…}
//
// 2) EslSpark: la variante `.spark.esl` del sparkline (una barra por año, con
//    el año debajo). Port exacto del `eslSpark` del builder `kpiSecHTML`:
//
//      eslSpark = series.map(x=>{
//        const bb = x.v>0 ? eslBand(x.v) : null;
//        const hp = Math.max(6,(x.v/mx)*100);
//        return `<div class="esc" title="…">
//          <span class="escwrap"><span class="escbar" style="height:${hp}%;background:${bb?bb.color:'var(--line)'}"></span></span>
//          <span class="escyr${x.k===curKey?' cur':''}">${x.k}</span></div>`;
//      });
//      <div class="spark esl">${eslSpark}</div>
//
//    donde mx = Math.max(...valoresNoNulos, 1)  (la serie ESL no es pct).
//    CSS: .kpi .spark.esl{…}  .esc/.escwrap/.escbar/.escyr(.cur) en globals.css.
//
// Componentes de PRESENTACIÓN: reciben el valor/serie ya calculados; usan
// `eslBand` de core/semaphore solo para derivar color+nombre de la banda.
//
// _Requirements: 2.2, 2.3, 16.3_
// =============================================================================

import { eslBand } from "@/core/semaphore";

// ---------------------------------------------------------------------------
// EslBadge — badge coloreado con el nombre de la banda ESL.
// ---------------------------------------------------------------------------
export interface EslBadgeProps {
  /** Valor de satisfacción (escala 0–5). La banda se deriva con eslBand(v). */
  value: number;
  /** Si es false, usa texto custom en vez del nombre de la banda. */
  label?: string;
}

/** `<span class="esl-badge" style="background:…">Nombre de banda</span>` */
export function EslBadge({ value, label }: EslBadgeProps) {
  const band = eslBand(value);
  return (
    <span className="esl-badge" style={{ background: band.color }}>
      {label ?? band.name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EslDot — punto coloreado por banda ESL (p. ej. en leyendas / filas).
// ---------------------------------------------------------------------------
export interface EslDotProps {
  value: number;
  title?: string;
}

/** `<span class="esl-dot" style="background:…"></span>` */
export function EslDot({ value, title }: EslDotProps) {
  const band = eslBand(value);
  return <span className="esl-dot" style={{ background: band.color }} title={title} />;
}

// ---------------------------------------------------------------------------
// EslSpark — variante .spark.esl del sparkline (barras por año, coloreadas).
// ---------------------------------------------------------------------------
export interface EslSparkPoint {
  /** Año de la barra ("2024", "2025", …). */
  k: string;
  /** Valor de satisfacción del año (0–5), o null/0 si no hay dato. */
  v: number | null;
}

export interface EslSparkProps {
  /** Serie anual de satisfacción (ya calculada por el dashboard). */
  series: EslSparkPoint[];
  /** Clave del año actual (barra `.escyr.cur`). */
  currentKey?: string;
}

/** `eslNum` del index: redondea a 2 decimales y lo pasa a string. */
function eslNum(x: number | null): string {
  const n = +(x ?? 0) || 0;
  return String(Math.round(n * 100) / 100);
}

/**
 * `<div class="spark esl">` con una `.esc` por año: barra `.escbar` con alto
 * `max(6,(v/mx)*100)%` y color de banda ESL (o var(--line) si no hay dato),
 * y el año en `.escyr` (con `.cur` para el año actual). Paridad exacta con
 * el `eslSpark` del builder `kpiSecHTML`.
 */
export function EslSpark({ series, currentKey }: EslSparkProps) {
  // mx = Math.max(...valoresNoNulos, 1)  (igual que el index; la serie no es pct).
  const nonNull = series.filter((x) => x.v != null).map((x) => x.v as number);
  const mx = Math.max(...nonNull, 1);

  return (
    <div className="spark esl">
      {series.map((x, i) => {
        const v = x.v ?? 0;
        const bb = v > 0 ? eslBand(v) : null;
        const hp = Math.max(6, (v / mx) * 100);
        const title = `${x.k}: ${eslNum(x.v)} / 5${bb ? " · " + bb.name : ""}`;
        return (
          <div key={i} className="esc" title={title}>
            <span className="escwrap">
              <span
                className="escbar"
                style={{ height: `${hp}%`, background: bb ? bb.color : "var(--line)" }}
              />
            </span>
            <span className={`escyr${x.k === currentKey ? " cur" : ""}`}>{x.k}</span>
          </div>
        );
      })}
    </div>
  );
}

export default EslBadge;

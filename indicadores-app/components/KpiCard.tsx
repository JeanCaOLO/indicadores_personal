// =============================================================================
// components/KpiCard.tsx
//
// Tarjeta de KPI (tarea 13.1). Paridad visual 1:1 con el Sistema_Actual
// (out/index.html, builder `kpiSecHTML`). La tarjeta completa `.kpi` es:
//
//   <div class="kpi">
//     <div class="top">
//       <div class="kname">${it.name}</div>
//       <span class="sem ${eslC?'':sm}" ${eslC?`style="background:${eslC.color}"`:''}></span>
//     </div>
//     <div class="valrow">
//       <div class="kval num">${valStr}${unitStr}</div>
//       <div class="spark${it.esl?' esl':''}">${it.esl?eslSpark:bars}</div>
//     </div>
//     <div class="foot">${it.esl?"":delta(it,v,pvv)}<span class="target">${tRange}</span></div>
//     ${byPais}
//     <div class="def">${it.def}</div>
//   </div>
//
// Donde:
//   valStr  = valid ? (it.esl ? eslNum(v) : fmt(v,it.type)) : "—"
//   unitStr = it.esl ? (valid?'<span class="u">/ 5</span>':"")
//                    : (valid && it.unit ? `<span class="u">${it.unit}</span>` : "")
//   sm      = it.info ? "na" : sem(it,v,valid)
//   eslC    = (it.esl && valid) ? eslBand(v) : null
//   tRange  = it.info ? "informativo"
//           : it.type==="pct" ? `meta ${lower?"≤":"≥"} ${(mt[lower?0:1]*100).toFixed(0)}%`
//           : `meta ${lower?"≤":"≥"} ${mt[lower?0:1]}${(type==="days"||unit==="días")?" d":""}`
//
// Componente de PRESENTACIÓN: recibe `it` (la definición KPI de core/kpi-defs),
// el valor ya calculado, su validez, la serie del sparkline y, opcionalmente,
// el valor previo (para el delta) y el bloque por país. Deriva las clases y el
// formato con `sem`/`eslBand`/`fmt`/`meta` de core, pero NO recalcula el KPI.
//
// Manejo de casos (idéntico al sistema actual):
//   - KPI informativo (it.info): `sm="na"` y `delta` con clase "flat"; target
//     muestra "informativo". El punto queda en estado "na" (como el index, que
//     fuerza sm="na" para info).
//   - KPI no disponible (valid=false): valStr="—", sin unidad, sem "na".
//   - KPI ESL (it.esl): valor con "/ 5", sem coloreado por banda (sin clase de
//     color), spark `.esl` y SIN delta en el foot.
//
// _Requirements: 2.2, 2.3, 16.3_
// =============================================================================

import type { KPI, ConfigGlobal } from "@/core/types";
import { eslBand, meta as metaOf, sem, type SemStatus } from "@/core/semaphore";
import { fmt } from "@/core/format";
import { Semaforo } from "./Semaforo";
import { Sparkline, type SparkPoint } from "./Sparkline";
import { EslSpark, type EslSparkPoint } from "./EslBadge";

export interface KpiCardProps {
  /** Definición del KPI (de core/kpi-defs: KMAP[clave]). */
  it: KPI;
  /** Valor ya calculado por el motor (compute). Puede ser null. */
  value: number | null;
  /** Si el KPI es válido para mostrarse (de kpiValid). Si no, se pinta "na". */
  valid: boolean;
  /** Valor previo/comparativo para el delta (prevK o año comparado). null = sin comparativo. */
  prevValue?: number | null;

  /** Serie del sparkline NO-ESL (meses). Omitir para KPIs ESL. */
  series?: SparkPoint[];
  /** Clave del mes actual (barra `.cur`) del sparkline NO-ESL. */
  currentKey?: string;
  /** Serie del sparkline ESL (años). Requerida para KPIs ESL. */
  eslSeries?: EslSparkPoint[];
  /** Clave del año actual para el spark ESL (barra `.cur`). */
  eslCurrentKey?: string;

  /**
   * Umbrales configurados (ConfigGlobal["metas"]) para derivar la meta efectiva
   * con `meta(it, metas)`. Si se omite, se usa `it.t`.
   */
  metas?: ConfigGlobal["metas"];
  /**
   * Texto de target ya resuelto. Si se pasa, reemplaza el cálculo por defecto
   * (lo usa el dashboard en modo comparativa, donde el target es "AÑO: valor").
   */
  targetText?: string;

  /** Bloque opcional "por país" (markup `.bypais`) ya calculado por el dashboard. */
  byPais?: React.ReactNode;
}

/** `eslNum` del index: redondea a 2 decimales. */
function eslNum(x: number | null): string {
  const n = +(x ?? 0) || 0;
  return String(Math.round(n * 100) / 100);
}

/**
 * Delta del foot. Port EXACTO de `function delta(it,v,pv)` del index:
 *   pv==null            → <span class="delta flat">— sin comparativo</span>
 *   diff===0            → <span class="delta flat">= sin cambio</span>
 *   cls = it.info?"flat":it.lower?(diff>0?"up":"down"):(diff>0?"gup":"gdown")
 *   dv  = pct? (|diff|*100).toFixed(1)+" pp" : |diff|.toFixed(int?0:1)
 *   → <span class="delta ${cls}">${diff>0?"▲":"▼"} ${dv}</span>
 */
function Delta({ it, v, pv }: { it: KPI; v: number; pv: number | null | undefined }) {
  if (pv == null) return <span className="delta flat">— sin comparativo</span>;
  const diff = v - pv;
  if (diff === 0) return <span className="delta flat">= sin cambio</span>;
  const cls = it.info ? "flat" : it.lower ? (diff > 0 ? "up" : "down") : diff > 0 ? "gup" : "gdown";
  const dv =
    it.type === "pct"
      ? (Math.abs(diff) * 100).toFixed(1) + " pp"
      : Math.abs(diff).toFixed(it.type === "int" ? 0 : 1);
  return (
    <span className={`delta ${cls}`}>
      {diff > 0 ? "▲" : "▼"} {dv}
    </span>
  );
}

/**
 * Texto de meta (`tRange`). Port del index:
 *   it.info → "informativo"
 *   pct     → `meta ≤|≥ ${(mt[i]*100).toFixed(0)}%`
 *   resto   → `meta ≤|≥ ${mt[i]}${(days||unit==="días")?" d":""}`
 */
function targetRange(it: KPI, metas?: ConfigGlobal["metas"]): string {
  if (it.info) return "informativo";
  const mt = metaOf(it, metas ?? {});
  if (!mt) return "informativo";
  const i = it.lower ? 0 : 1;
  const sign = it.lower ? "≤" : "≥";
  if (it.type === "pct") return `meta ${sign} ${(mt[i] * 100).toFixed(0)}%`;
  const suffix = it.type === "days" || it.unit === "días" ? " d" : "";
  return `meta ${sign} ${mt[i]}${suffix}`;
}

/**
 * Tarjeta de KPI completa. Reproduce el markup y las clases de `kpiSecHTML`.
 */
export function KpiCard({
  it,
  value,
  valid,
  prevValue,
  series,
  currentKey,
  eslSeries,
  eslCurrentKey,
  metas,
  targetText,
  byPais,
}: KpiCardProps) {
  const v = value ?? 0;

  // eslC = (it.esl && valid) ? eslBand(v) : null
  const eslC = it.esl && valid ? eslBand(v) : null;
  // sm = it.info ? "na" : sem(it,v,valid)
  const sm: SemStatus = it.info ? "na" : sem(it, v, valid, metas ?? {});

  // valStr / unitStr (paridad exacta con el index).
  const valStr = valid ? (it.esl ? eslNum(value) : fmt(v, it.type)) : "—";
  const showUnit = it.esl ? valid : valid && !!it.unit;
  const unitLabel = it.esl ? "/ 5" : it.unit;

  const tRange = targetText ?? targetRange(it, metas);

  return (
    <div className="kpi">
      <div className="top">
        <div className="kname">{it.name}</div>
        {/* class="sem ${eslC?'':sm}" + style background si hay banda ESL */}
        <Semaforo status={sm} color={eslC?.color ?? null} />
      </div>

      <div className="valrow">
        <div className="kval num">
          {valStr}
          {showUnit && <span className="u">{unitLabel}</span>}
        </div>
        {it.esl ? (
          <EslSpark series={eslSeries ?? []} currentKey={eslCurrentKey} />
        ) : (
          <Sparkline series={series ?? []} currentKey={currentKey} type={it.type} />
        )}
      </div>

      <div className="foot">
        {/* ESL no muestra delta; el resto sí */}
        {it.esl ? null : <Delta it={it} v={v} pv={prevValue} />}
        <span className="target">{tRange}</span>
      </div>

      {byPais}

      <div className="def">{it.def}</div>
    </div>
  );
}

export default KpiCard;

// =============================================================================
// components/dashboard/DashboardClient.tsx  —  motor + render (tarea 14.1)
//
// CLIENT COMPONENT ("use client"). Recibe el `db` (JSON plano serializable),
// los filtros (mes/anio/view/anio2/pais/dep/area) y `paisFijado` desde el
// Server Component (app/(app)/dashboard/page.tsx) y:
//
//   · Construye el `ComputeContext` { pais, dep, area, today, dashYear }.
//   · Corre el motor en memoria con `compute(mes, db, ctx)` + `valOf/accValue`
//     (core/compute, core/accumulate). RECOMPUTA en memoria cuando cambian los
//     filtros, pero memoizado por (mes, pais, dep, area, view, year) con
//     useMemo para no recalcular de más (Req 17.1).
//   · Renderiza, en el MISMO ORDEN y con las MISMAS clases que `renderDash`
//     de out/index.html:
//       1. Comparativa por país  (cuando pais==="__all__" && view==="mes")
//       2. Franja ejecutiva `.exec` (5 celdas con sus deltas)
//       3. Secciones por GRUPO (7 grupos) con `.kpi-grid` de <KpiCard/>
//          (incluye el bloque `.bypais` dentro de cada tarjeta cuando aplica)
//       4. Horas hombre del mes
//       5. Distribuciones (DistTable): sexo, nivel educativo, carrera,
//          movilidad M1–M7, departamento, área.
//
// RECÁLCULO POR FILTROS (Req 5.4):
//   Los filtros viven en la URL (los pone la FilterBar, tarea 12.3). Al
//   cambiarlos, el Server Component recarga con los nuevos params y vuelve a
//   pasar props a este cliente; además, el cliente recomputa en memoria al
//   cambiar cualquier prop de filtro (useMemo). Doble garantía.
//
// paisScope (Req 5.5):
//   El país efectivo ya lo resolvió el Server Component (scope 'pais' → país
//   fijo). Este cliente SOLO usa el `pais` recibido para el motor; no deja que
//   el usuario vea otro país. `paisFijado` se usa para no pintar la comparativa
//   consolidada cuando el usuario está restringido a un país.
//
// _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 17.1_
// =============================================================================

"use client";

import { useMemo } from "react";

import type { ComputeContext, ComputeResult, ConfigDB, KPI as KpiDef, MonthKey } from "../../core/types";
import { compute, hasData } from "../../core/compute";
import { valOf, type AccumulateOpts, type View } from "../../core/accumulate";
import { KPI, KMAP, MLONG, MSHORT, PAISES, monthsOf, mi } from "../../core/kpi-defs";
import { kpiValid } from "../../core/semaphore";
import { fmt, nfmt, pct, titleCase } from "../../core/format";

import { KpiCard } from "../KpiCard";
import { DistTable, type DistRow } from "../tables";
import type { SparkPoint } from "../Sparkline";
import type { EslSparkPoint } from "../EslBadge";

// ===========================================================================
// Helpers de mes (port de out/index.html):
//   mShort=k=>MSHORT[mi(k)]+" '"+String(yOf(k)).slice(2)
//   mLong =k=>MLONG[mi(k)]+" "+yOf(k)
// ===========================================================================
const yOf = (k: string) => +k.slice(0, 4);
const mShort = (k: string) => MSHORT[mi(k)] + " '" + String(yOf(k)).slice(2);
const mLong = (k: string) => MLONG[mi(k)] + " " + yOf(k);

/** Años máximos a mostrar en el spark ESL (ESL_MAX_YEARS del index = 6). */
const ESL_MAX_YEARS = 6;

export interface DashboardClientProps {
  db: ConfigDB;
  year: number;
  mes: string;
  view: View;
  year2: number;
  pais: string;
  dep: string;
  area: string;
  /** scope 'pais' → el país está fijado (no se muestra la comparativa consolidada). */
  paisFijado: boolean;
}

// ===========================================================================
// Franja ejecutiva — una celda
// ===========================================================================
function ExecDelta({ it, v, pv }: { it: { info?: boolean; type: string; lower?: boolean }; v: number | null; pv: number | null }) {
  // Port de `function delta(it,v,pv)` del index (misma lógica que KpiCard.Delta).
  if (v == null || pv == null) return <span className="delta flat">— sin comparativo</span>;
  const diff = v - pv;
  if (diff === 0) return <span className="delta flat">= sin cambio</span>;
  const cls = it.info ? "flat" : it.lower ? (diff > 0 ? "up" : "down") : diff > 0 ? "gup" : "gdown";
  const dv = it.type === "pct" ? (Math.abs(diff) * 100).toFixed(1) + " pp" : Math.abs(diff).toFixed(it.type === "int" ? 0 : 1);
  return (
    <span className={`delta ${cls}`}>
      {diff > 0 ? "▲" : "▼"} {dv}
    </span>
  );
}

export function DashboardClient({ db, year, mes, view, year2, pais, dep, area, paisFijado }: DashboardClientProps) {
  const CUR = mes as MonthKey;

  // ctx del motor (reemplaza PAIS/DEP/AREA/TODAY/CUR del index).
  const ctx: ComputeContext = useMemo(
    () => ({ pais, dep, area, today: new Date(), dashYear: year }),
    [pais, dep, area, year],
  );

  const months = useMemo(() => monthsOf(year), [year]);

  // Opts de los acumuladores (inyecta compute/hasData/months/db/ctx).
  const accOpts: AccumulateOpts = useMemo(
    () => ({ db, ctx, months, compute, hasData }),
    [db, ctx, months],
  );

  // compute del mes actual (memoizado por el contexto efectivo).
  const c = useMemo(() => compute(CUR, db, ctx), [CUR, db, ctx]);
  const curHasData = useMemo(() => hasData(CUR, db), [CUR, db]);

  // Mes previo (para el delta en vista mes/acum) y clave de comparación (vista comp).
  const prevK = mi(CUR) > 0 ? months[mi(CUR) - 1] : null;
  const prev = useMemo(() => (prevK ? compute(prevK, db, ctx) : null), [prevK, db, ctx]);
  const compKey = `${year2}-${CUR.slice(5, 7)}` as MonthKey;

  // Comparativa por país: solo cuando consolidado + vista mes + scope global.
  const paisComp = useMemo(() => {
    if (pais !== "__all__" || view !== "mes" || paisFijado) return null;
    const out: Record<string, ComputeResult> = {};
    PAISES.forEach((pp) => {
      out[pp] = compute(CUR, db, { ...ctx, pais: pp });
    });
    return out;
  }, [pais, view, paisFijado, CUR, db, ctx]);

  // ---------------------------------------------------------------------------
  // helpers de lectura de valor / validez (con el ctx de kpiValid del mes)
  // ---------------------------------------------------------------------------
  const kvCtx = {
    params: db[CUR]?.params ?? ({} as never),
    satisfaccion: db.__cfg?.satisfaccion ?? {},
    year: CUR.slice(0, 4),
    hasData: curHasData,
  };
  const metas = db.__cfg?.metas ?? {};
  const isValid = (key: string) => kpiValid(key, c as never, kvCtx);
  const vOf = (it: KpiDef, k: MonthKey) => valOf(it, k, view, accOpts);

  // Valor "previo"/base para el delta (mes anterior, o año comparado en view=comp).
  const baseVal = (it: KpiDef): number | null => {
    if (view === "comp") return compute(compKey, db, ctx).ind[it.k];
    return prevK ? valOf(it, prevK, view, accOpts) : null;
  };

  // ===========================================================================
  // 1) Comparativa por país
  // ===========================================================================
  function renderPaisComp() {
    if (!paisComp) return null;
    const prows = PAISES.filter(
      (pp) => (paisComp[pp].rosterN as number) > 0 || (paisComp[pp].hcTot as number) > 0 || (paisComp[pp].egAllN as number) > 0,
    );
    if (!prows.length) return null;
    const cell = (cc: ComputeResult, key: string) => {
      const ok = kpiValid(key, cc as never, {
        params: db[CUR]?.params ?? ({} as never),
        satisfaccion: db.__cfg?.satisfaccion ?? {},
        year: CUR.slice(0, 4),
        hasData: curHasData,
      });
      return ok ? pct(cc.ind[key] ?? 0) + "%" : "—";
    };
    return (
      <div className="card nocollapse" style={{ marginBottom: 18 }}>
        <div className="ch">
          <h3>Comparativa por país</h3>
          <span className="hint">{mLong(CUR)} · indicadores cabecera por país</span>
        </div>
        <div className="cb">
          <table>
            <thead>
              <tr>
                <th>País</th>
                <th className="num">Colaboradores</th>
                <th className="num">Rotación</th>
                <th className="num">Ausentismo</th>
                <th className="num">Deserción 1er año</th>
              </tr>
            </thead>
            <tbody>
              {prows.map((pp) => {
                const cc = paisComp[pp];
                return (
                  <tr key={pp}>
                    <td>{pp}</td>
                    <td className="num">{nfmt(cc.hcTot)}</td>
                    <td className="num">{cell(cc, "rot_total")}</td>
                    <td className="num">{cell(cc, "ausentismo")}</td>
                    <td className="num">{cell(cc, "desercion")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 2) Franja ejecutiva
  // ===========================================================================
  function renderExec() {
    // dv(key): base para el delta de la celda (año comparado o mes previo).
    const dv = (key: string): number | null => {
      const it = KMAP[key];
      if (view === "comp") return compute(compKey, db, ctx).ind[it.k];
      return prevK ? valOf(it, prevK, view, accOpts) : null;
    };
    const ausOk = isValid("ausentismo");
    const desOk = isValid("desercion");
    const cells = [
      {
        l: "Colaboradores",
        v: nfmt(c.hcTot),
        u: "",
        delta: <ExecDelta it={{ info: true, type: "int" }} v={c.hcTot} pv={prev ? (prev.hcTot as number) : null} />,
      },
      {
        l: view === "acum" ? "Rotación acumulada" : "Rotación del mes",
        v: pct(vOf(KMAP.rot_total, CUR) ?? 0),
        u: "%",
        delta: <ExecDelta it={KMAP.rot_total} v={vOf(KMAP.rot_total, CUR)} pv={dv("rot_total")} />,
      },
      {
        l: "Ausentismo",
        v: ausOk ? pct(vOf(KMAP.ausentismo, CUR) ?? 0) : "—",
        u: ausOk ? "%" : "",
        delta: <ExecDelta it={KMAP.ausentismo} v={vOf(KMAP.ausentismo, CUR)} pv={dv("ausentismo")} />,
      },
      {
        l: "Días sin accidentes",
        v: c.diasSinAcc != null ? nfmt(c.diasSinAcc) : "—",
        u: "",
        delta: <span className="delta flat">SSL</span>,
      },
      {
        l: "Deserción 1er año",
        v: desOk ? pct(vOf(KMAP.desercion, CUR) ?? 0) : "—",
        u: desOk ? "%" : "",
        delta: <ExecDelta it={KMAP.desercion} v={vOf(KMAP.desercion, CUR)} pv={dv("desercion")} />,
      },
    ];
    return (
      <div className="exec">
        {cells.map((e, i) => (
          <div className="cell" key={i}>
            <div className="l">{e.l}</div>
            <div className="v num">
              {e.v}
              <span className="u">{e.u}</span>
            </div>
            {e.delta}
          </div>
        ))}
      </div>
    );
  }

  // ===========================================================================
  // 3) Secciones por grupo (7 grupos) con KpiCards
  // ===========================================================================
  function renderGroup(grp: (typeof KPI)[number]) {
    const items = grp.items.filter((it) => !((db.__cfg?.kpiOff ?? []) as string[]).includes(it.k));
    if (!items.length) return null;
    const g2 = grp.g === "Rotación" || grp.g === "Seguridad y Salud Laboral";
    return (
      <div className="sec" key={grp.g}>
        <div className="sec-head">
          <span className="eb">{grp.area}</span>
          <h2>{grp.g}</h2>
          {view === "acum" ? <span className="note">{`acumulado Ene–${mShort(CUR)}`}</span> : null}
        </div>
        <div className="legend">
          <span className="it">
            <span className="dot ok"></span>En meta
          </span>
          <span className="it">
            <span className="dot warn"></span>En observación
          </span>
          <span className="it">
            <span className="dot danger"></span>Fuera de meta
          </span>
          <span className="it">
            <span className="dot na"></span>Sin dato
          </span>
        </div>
        <div className={`kpi-grid${g2 ? " g2" : ""}`}>
          {items.map((it) => renderKpi(it))}
        </div>
      </div>
    );
  }

  function renderKpi(it: KpiDef) {
    const v = vOf(it, CUR);
    const valid = isValid(it.k);
    const pvv = baseVal(it);

    // Serie del sparkline.
    let series: SparkPoint[] | undefined;
    let eslSeries: EslSparkPoint[] | undefined;
    let currentKey: string | undefined;
    let eslCurrentKey: string | undefined;

    if (it.esl) {
      // Satisfacción anual: una barra por año con dato (config anual + respaldo por mes).
      const ys: Record<string, number> = {};
      const sat = db.__cfg?.satisfaccion ?? {};
      Object.keys(sat).forEach((yr) => {
        if (+sat[yr] > 0) ys[yr] = +sat[yr];
      });
      Object.keys(db).forEach((mk) => {
        if (!/^\d{4}-\d{2}$/.test(mk)) return;
        const yr = mk.slice(0, 4);
        const ev = +((db[mk as MonthKey] && db[mk as MonthKey].params && (db[mk as MonthKey].params as never as Record<string, unknown>).encuesta) || 0);
        if (ev > 0 && !ys[yr]) ys[yr] = ev;
      });
      const curYr = +CUR.slice(0, 4);
      const yrsAll = Object.keys(ys)
        .map(Number)
        .filter((y) => y <= curYr)
        .sort((a, b) => a - b);
      eslSeries = yrsAll.slice(-ESL_MAX_YEARS).map((yr) => ({ k: String(yr), v: ys[yr] }));
      eslCurrentKey = String(curYr);
    } else {
      series = months.map((k) => ({ k, v: k <= CUR ? valOf(it, k, view, accOpts) : null }));
      currentKey = CUR;
    }

    // Target en modo comparativa: "AÑO2: valor".
    let targetText: string | undefined;
    if (view === "comp") {
      const cc2 = compute(compKey, db, ctx);
      const cok = kpiValid(it.k, cc2 as never, {
        params: db[compKey]?.params ?? ({} as never),
        satisfaccion: db.__cfg?.satisfaccion ?? {},
        year: compKey.slice(0, 4),
        hasData: hasData(compKey, db),
      });
      targetText = `${year2}: ${cok ? fmt(pvv ?? 0, it.type) + (it.unit ? it.unit : "") : "—"}`;
    }

    // Bloque por país (.bypais) dentro de la tarjeta.
    let byPais: React.ReactNode = null;
    if (paisComp && !it.esl) {
      const parts = PAISES.filter(
        (pp) => (paisComp[pp].rosterN as number) > 0 || (paisComp[pp].hcTot as number) > 0 || (paisComp[pp].egAllN as number) > 0,
      ).map((pp) => {
        const cc = paisComp[pp];
        const ok = kpiValid(it.k, cc as never, {
          params: db[CUR]?.params ?? ({} as never),
          satisfaccion: db.__cfg?.satisfaccion ?? {},
          year: CUR.slice(0, 4),
          hasData: curHasData,
        });
        const sigla = pp
          .split(" ")
          .map((w) => w[0])
          .join("");
        return (
          <span className="pc" key={pp}>
            <b>{sigla}</b> {ok ? fmt(cc.ind[it.k] ?? 0, it.type) + (it.type === "pct" ? "%" : "") : "—"}
          </span>
        );
      });
      if (parts.length) byPais = <div className="bypais">{parts}</div>;
    }

    return (
      <KpiCard
        key={it.k}
        it={it}
        value={v}
        valid={valid}
        prevValue={pvv}
        series={series}
        currentKey={currentKey}
        eslSeries={eslSeries}
        eslCurrentKey={eslCurrentKey}
        metas={metas}
        targetText={targetText}
        byPais={byPais}
      />
    );
  }

  // ===========================================================================
  // 4) Horas hombre del mes
  // ===========================================================================
  function renderHorasHombre() {
    const hhP = (db[CUR] && db[CUR].params) || ({} as never);
    const hp = hhP as Record<string, unknown>;
    const hhTot = +(hp.horas_hombre as number) || 0;
    const hhOrd = +(hp.hh_ord as number) || 0;
    const hhExt = +(hp.hh_ext as number) || 0;
    const hhCatRows = Object.entries((hp.hh_cat as Record<string, number>) || {})
      .filter((r) => +r[1])
      .sort((a, b) => (b[1] as number) - (a[1] as number));
    // Mes previo (vs) — igual que el index.
    const prevHhKey = (() => {
      const parts = CUR.split("-").map(Number);
      return parts[1] > 1 ? `${parts[0]}-${String(parts[1] - 1).padStart(2, "0")}` : `${parts[0] - 1}-12`;
    })();
    const hhPrev = +((db[prevHhKey as MonthKey] && db[prevHhKey as MonthKey].params && ((db[prevHhKey as MonthKey].params as never as Record<string, unknown>).horas_hombre as number)) || 0);

    if (hhTot <= 0) {
      return (
        <div className="card">
          <div className="ch">
            <h3>Horas hombre del mes</h3>
            <span className="hint">{mLong(CUR)}</span>
          </div>
          <div className="cb">
            <div className="empty">
              <b>Sin horas hombre cargadas</b>Subí el archivo <b>Costo por Hora</b> en Administrar datos → Horas hombre.
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="card">
        <div className="ch">
          <h3>Horas hombre del mes</h3>
          <span className="hint">{mLong(CUR)} · desde Administrar datos</span>
        </div>
        <div className="cb">
          <div style={{ padding: "16px 14px 14px" }}>
            <div className="num" style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 30, lineHeight: 1, color: "var(--ink)" }}>
              {nfmt(Math.round(hhTot))}
              <span style={{ fontSize: 14, color: "var(--faint)", fontWeight: 600 }}> h</span>
            </div>
            {hhPrev > 0 ? (
              <div style={{ marginTop: 6 }}>
                <ExecDelta it={{ type: "int", lower: false }} v={hhTot} pv={hhPrev} />{" "}
                <span style={{ fontSize: 11, color: "var(--faint)" }}>vs {mShort(prevHhKey)}</span>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
              <span>
                Ordinarias <b className="num">{nfmt(Math.round(hhOrd))}</b>
              </span>
              <span>
                Extras <b className="num">{nfmt(Math.round(hhExt))}</b>
              </span>
            </div>
            {hhCatRows.length ? (
              <table style={{ marginTop: 12 }}>
                <tbody>
                  {hhCatRows.map(([k, vv]) => (
                    <tr key={k}>
                      <td>{titleCase(k)}</td>
                      <td className="num">{nfmt(Math.round(vv as number))}</td>
                      <td className="num">{((((vv as number) / (hhOrd || hhTot)) * 100) || 0).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 5) Distribuciones (DistTable)
  // ===========================================================================
  /** Convierte un `Record<label, conteo>` de compute a DistRow[] ordenado desc. */
  function toRows(obj: Record<string, number> | undefined): DistRow[] {
    return Object.entries(obj ?? {})
      .map(([label, value]) => ({ label, value: value as number }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  function renderDistribuciones() {
    const sexo = toRows(c.sexoC as Record<string, number>);
    const educ = toRows(c.educC as Record<string, number>);
    const carrera = toRows(c.carreraC as Record<string, number>).slice(0, 5);
    const movM = toRows(c.movMC as Record<string, number>);
    const depto = toRows(c.depC as Record<string, number>);
    const areaRows = toRows(c.areaC as Record<string, number>);
    return (
      <div className="sec">
        <div className="sec-head">
          <span className="eb">Personal</span>
          <h2>Distribución de la plantilla</h2>
          {c.rosterN ? <span className="note">{`${c.rosterN as number} colaboradores`}</span> : null}
        </div>
        <div className="cols c2">
          <DistTable title="Por sexo" rows={sexo} empty={{ title: "Sin dato de sexo", hint: "Completá la columna sexo en la lista de colaboradores." }} />
          <DistTable title="Nivel educativo" rows={educ} empty={{ title: "Sin dato educativo", hint: "Completá la columna nivel educativo." }} />
        </div>
        <div className="cols c2" style={{ marginTop: 16 }}>
          <DistTable title="Estudios superiores" hint="top 5 carreras más frecuentes" rows={carrera} empty={{ title: "Sin carreras cargadas", hint: "Completá la columna carrera en la lista de colaboradores." }} />
          <DistTable title="Movilidad (M1–M7)" hint="criterio gerencial" rows={movM} empty={{ title: "Sin dato de movilidad", hint: "Completá la columna movilidad (M1–M7)." }} />
        </div>
        <div className="cols c2" style={{ marginTop: 16 }}>
          <DistTable title="Por departamento" rows={depto} empty={{ title: "Sin dato de departamento", hint: "Completá la columna departamento." }} />
          <DistTable title="Por área" rows={areaRows} empty={{ title: "Sin dato de área", hint: "Completá la columna área." }} />
        </div>
      </div>
    );
  }

  // ===========================================================================
  // Render principal
  // ===========================================================================
  if (!curHasData) {
    return (
      <div id="v-dash">
        <div className="banner">
          No hay datos para {mLong(CUR)}. Abre <b>Administrar datos</b> para cargar colaboradores, egresos, ausencias y
          parámetros del mes.
        </div>
      </div>
    );
  }

  // Grupos filtrados por el área responsable (AREA del index).
  const groups = KPI.filter((grp) => area === "__all__" || grp.area === area);

  return (
    <div id="v-dash">
      {/* 1. Comparativa por país */}
      {renderPaisComp()}

      {/* 2. Franja ejecutiva */}
      {renderExec()}

      {/* 3. Secciones por grupo */}
      {groups.map((grp) => renderGroup(grp))}

      {/* 4. Horas hombre del mes */}
      <div className="sec" style={{ marginTop: 16 }}>
        <div className="sec-head">
          <span className="eb">Personal</span>
          <h2>Horas hombre</h2>
          <span className="note">{mLong(CUR)}</span>
        </div>
        {renderHorasHombre()}
      </div>

      {/* 5. Distribuciones */}
      {renderDistribuciones()}
    </div>
  );
}

export default DashboardClient;

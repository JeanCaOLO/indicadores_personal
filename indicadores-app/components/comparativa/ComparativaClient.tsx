// =============================================================================
// components/comparativa/ComparativaClient.tsx
//
// Vista Comparativa (tarea 14.3) — CLIENT COMPONENT.
//
// FUENTE DE VERDAD: out/index.html → función `renderComp()` (la pestaña "Tipo"
// de la Vista Corporativa). Replica su estructura, clases y helpers:
//   compType / compDisp / compDec / compAcumV / presNum / numCell / accCellC
// y los dos modos de comparación:
//   · "por país" (COMP_DIM="pais"): filas = países con datos, columnas = los 12
//     meses del año elegido + columna anual acumulada.
//   · "por año"  (COMP_DIM="anio"): filas = años con datos, columnas = los 12
//     meses + columna "Acum." para el país/consolidado elegido ("Vista").
//
// SCOPE (Req 8.3): si `paisScope` es un país concreto (scope 'pais'), la
// comparación se restringe a ese país:
//   · el selector "Vista" (modo por año) queda fijado y deshabilitado en su
//     país, y
//   · el modo "por país" solo puede mostrar su propia fila (los demás países
//     se excluyen del cálculo antes de renderizar, igual que RLS excluye sus
//     filas en el servidor).
//
// ARQUITECTURA: el `db` (ConfigDB) y los filtros llegan por props desde el
// Server Component (page.tsx). El estado local de la vista (indicador, dimensión
// de comparación, año, "Vista") vive en el cliente; el motor (`compute`) se
// ejecuta en memoria al cambiar cualquiera. No hay DOM imperativo: todo es JSX.
//
// PARIDAD con renderComp: en el original `compDisp` muta la global PAIS; aquí
// se pasa el país como `ctx.pais` a `compute`, que es el reemplazo del global.
//
// _Requirements: 8.1, 8.2, 8.3_
// =============================================================================

"use client";

import { useMemo, useState } from "react";

import { compute } from "../../core/compute";
import { KMAP, KPI, MSHORT, mi, monthsOf } from "../../core/kpi-defs";
import type { ComputeContext, ConfigDB, MonthKey, PaisScope } from "../../core/types";

// Países del dominio (const PAISES en out/index.html).
const PAISES = ["Venezuela", "Costa Rica", "El Salvador", "Guatemala", "Colombia"];
// Años base (const YEARS=[2024,2025,2026,2027] en out/index.html).
const YEARS = [2024, 2025, 2026, 2027];

// Campos que determinan si un país tiene datos registrados (paisesData()).
const PAIS_FLDS = [
  "activos",
  "egresos",
  "ausencias",
  "extras",
  "terceros",
  "vacaciones",
  "capacitacion",
  "merma",
] as const;

export interface ComparativaClientProps {
  /** ConfigDB con TODOS los años (merge de loadDB por año) + __cfg. */
  db: ConfigDB;
  /** Filtro de país resuelto por RBAC: "__all__" (global) o un país (scope pais). */
  paisScope: PaisScope;
  /** Año inicial (del filtro de la URL). */
  anioInicial: number;
  /** Fecha de corte del motor (hoy), inyectada desde el servidor (determinismo SSR). */
  today: number;
}

export default function ComparativaClient({
  db,
  paisScope,
  anioInicial,
  today,
}: ComparativaClientProps) {
  const paisFijado = paisScope !== "__all__";

  // ---------------------------------------------------------------------------
  // Estado local de la vista (COMP_KEY, COMP_DIM, YEAR, PAIS "Vista").
  // Con scope 'pais' el modo se fija en "anio" (no puede comparar otros países).
  // ---------------------------------------------------------------------------
  const [compKey, setCompKey] = useState<string>("rot_total");
  const [compDim, setCompDim] = useState<"pais" | "anio">(
    paisFijado ? "anio" : "pais",
  );
  const [year, setYear] = useState<number>(anioInicial);
  // "Vista" (país/consolidado) del modo por año. Si el scope es país, fijado.
  const [vista, setVista] = useState<string>(paisFijado ? (paisScope as string) : "__all__");

  // Fecha de corte estable para el motor (reconstruida desde el epoch del server).
  const todayDate = useMemo(() => new Date(today), [today]);

  // ---------------------------------------------------------------------------
  // Helpers portados de renderComp (out/index.html)
  // ---------------------------------------------------------------------------

  // function hasData(k){...} — hay datos en el mes k (reusa la forma del motor).
  const hasData = (mk: string): boolean => {
    const d = db[mk as MonthKey] as
      | {
          egresos?: unknown[];
          activos?: unknown[];
          ausencias?: unknown[];
          areas?: unknown[];
          capacitacion?: unknown[];
          extras?: unknown[];
          params?: { prom_colab?: number; hc_indet?: number[] };
        }
      | undefined;
    if (!d) return false;
    return !!(
      (d.egresos && d.egresos.length) ||
      (d.activos && d.activos.length) ||
      (d.ausencias && d.ausencias.length) ||
      (d.areas && d.areas.length) ||
      (d.capacitacion && d.capacitacion.length) ||
      (d.extras && d.extras.length) ||
      (d.params &&
        ((d.params.prom_colab || 0) ||
          (d.params.hc_indet && d.params.hc_indet.some((x) => x))))
    );
  };

  // function compType(key){return key==="hcTot"?"int":(KMAP[key]?KMAP[key].type:"num");}
  const compType = (key: string): string =>
    key === "hcTot" ? "int" : KMAP[key] ? KMAP[key].type : "num";

  // function compDec(key){const t=compType(key);return t==="pct"?1:t==="int"?0:1;}
  const compDec = (key: string): number => {
    const t = compType(key);
    return t === "pct" ? 1 : t === "int" ? 0 : 1;
  };

  // function compDisp(key,pais,mk){...} — valor a mostrar (pct ×100), o null.
  const compDisp = (key: string, pais: string, mk: string): number | null => {
    if (!hasData(mk)) return null;
    const ctx: ComputeContext = {
      pais,
      dep: "__all__",
      area: "__all__",
      today: todayDate,
      dashYear: +mk.slice(0, 4),
    };
    const c = compute(mk as MonthKey, db, ctx);
    const v = key === "hcTot" ? (c.hcTot as number) : c.ind[key];
    if (v == null || isNaN(v)) return null;
    return compType(key) === "pct" ? (v as number) * 100 : (v as number);
  };

  // function compAcumV(key,pais,months){...} — acumulado anual de la fila.
  const compAcumV = (key: string, pais: string, months: string[]): number | null => {
    const dm = months.filter(hasData);
    if (!dm.length) return null;
    const t = compType(key);
    // hcTot y days: último valor disponible (snapshot), no suma.
    if (key === "hcTot" || t === "days") {
      for (let i = dm.length - 1; i >= 0; i--) {
        const v = compDisp(key, pais, dm[i]);
        if (v != null) return v;
      }
      return null;
    }
    let s = 0,
      any = false;
    dm.forEach((mk) => {
      const v = compDisp(key, pais, mk);
      if (v != null) {
        s += v;
        any = true;
      }
    });
    return any ? s : null;
  };

  // function presNum(v,dec){...} — formato es-CR con `dec` decimales.
  const presNum = (v: number, dec: number): string =>
    (Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec)).toLocaleString("es-CR", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });

  // paisesData() — países con datos registrados en todo el db.
  const paisesData = useMemo(() => {
    const ks = Object.keys(db).filter((k) => /^\d{4}-\d{2}$/.test(k));
    return PAISES.filter((pp) =>
      ks.some((k) => {
        const m = db[k as MonthKey] as unknown as Record<string, unknown[]>;
        return (
          m &&
          PAIS_FLDS.some(
            (f) =>
              Array.isArray(m[f]) &&
              (m[f] as { pais?: string }[]).some((r) => r && r.pais === pp),
          )
        );
      }),
    );
  }, [db]);

  // ---------------------------------------------------------------------------
  // Opciones del selector de indicador (igual que renderComp):
  //   [{k:"hcTot",n:"Colaboradores"}] + todos los KPIs no-ESL.
  // ---------------------------------------------------------------------------
  const indOpts = useMemo(
    () =>
      [{ k: "hcTot", n: "Colaboradores" }].concat(
        KPI.flatMap((g) =>
          g.items.filter((it) => !it.esl).map((it) => ({ k: it.k, n: it.name })),
        ),
      ),
    [],
  );

  // ---------------------------------------------------------------------------
  // Datos derivados para el render (filas + celdas).
  // ---------------------------------------------------------------------------
  const yr = year;
  const months = monthsOf(yr);
  const curIdx = mi(`${yr}-07`); // (en el original es mi(CUR); aquí no hay mes current por fila)
  const dec = compDec(compKey);

  // Con scope 'pais', el país "efectivo" del modo por año es siempre su país.
  const vistaEff = paisFijado ? (paisScope as string) : vista;

  // Filas del modo "por país": países con datos para el indicador en el año.
  // Con scope 'pais' SOLO su país (Req 8.3).
  const rowsPais = useMemo(() => {
    if (compDim !== "pais") return [];
    const rowsAll = paisFijado ? [paisScope as string] : PAISES;
    return rowsAll.filter((pp) => months.some((mk) => compDisp(compKey, pp, mk) != null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compDim, compKey, yr, paisFijado, paisScope]);

  // Filas del modo "por año": años con datos.
  const rowsAnio = useMemo(() => {
    if (compDim !== "anio") return [];
    return YEARS.filter((y) => monthsOf(y).some(hasData));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compDim]);

  // Celda numérica normal (· cuando no hay dato / ~0).
  const numCell = (v: number | null, d: number, key: string) => {
    const na = v == null || isNaN(v) || Math.abs(v) < Math.pow(10, -d) / 2;
    return (
      <td key={key} className={na ? "pbi-na" : undefined}>
        {na ? "·" : presNum(v as number, d)}
      </td>
    );
  };
  // Celda de la columna acumulada (clase .acc).
  const accCellC = (v: number | null, d: number, key: string) => {
    const na = v == null || isNaN(v) || Math.abs(v) < Math.pow(10, -d) / 2;
    return (
      <td key={key} className={`acc${na ? " pbi-na" : ""}`}>
        {na ? "·" : presNum(v as number, d)}
      </td>
    );
  };

  // ---------------------------------------------------------------------------
  // Render (estructura idéntica a renderComp: .pbi > .pbi-bar > .pbi-scroll > table.pbi-tbl)
  // ---------------------------------------------------------------------------
  return (
    <div className="pbi">
      <div className="pbi-bar">
        <div className="pbi-side">
          <span className="lbl">Indicador</span>
          <span>
            <select
              className="pbi-sel"
              id="compKey"
              style={{ minWidth: 220 }}
              value={compKey}
              onChange={(e) => setCompKey(e.target.value)}
            >
              {indOpts.map((o) => (
                <option key={o.k} value={o.k}>
                  {o.n}
                </option>
              ))}
            </select>
          </span>
          <span className="lbl">Comparar por</span>
          <span>
            <select
              className="pbi-sel"
              id="compDim"
              value={compDim}
              disabled={paisFijado}
              title={
                paisFijado
                  ? `Acceso fijado a ${paisScope}: comparación por año de su país`
                  : undefined
              }
              onChange={(e) => setCompDim(e.target.value as "pais" | "anio")}
            >
              <option value="pais">País</option>
              <option value="anio">Año</option>
            </select>
          </span>
        </div>

        <div className="pbi-mark">
          <b style={{ fontSize: 20, letterSpacing: 1 }}>OLO</b>
        </div>

        <div className="pbi-side r">
          {compDim === "pais" ? (
            <>
              <span className="lbl">Año</span>
              <span>
                <select
                  className="pbi-sel"
                  id="compAnio"
                  value={yr}
                  onChange={(e) => setYear(+e.target.value)}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </span>
            </>
          ) : (
            <>
              <span className="lbl">Vista</span>
              <span>
                <select
                  className="pbi-sel"
                  id="compPais"
                  value={vistaEff}
                  disabled={paisFijado}
                  title={paisFijado ? `Acceso fijado a ${paisScope}` : undefined}
                  onChange={(e) => setVista(e.target.value)}
                >
                  {paisFijado ? (
                    <option value={paisScope as string}>{paisScope as string}</option>
                  ) : (
                    <>
                      <option value="__all__">Consolidado</option>
                      {paisesData.map((pp) => (
                        <option key={pp} value={pp}>
                          {pp}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </span>
            </>
          )}
        </div>
      </div>

      <div className="pbi-scroll">
        <table className="pbi-tbl">
          <thead>
            <tr>
              <th className="desc">{compDim === "pais" ? "País" : "Año"}</th>
              {months.map((mk, i) => (
                <th
                  key={mk}
                  className={i === curIdx && compDim === "pais" ? "cur" : undefined}
                >
                  {MSHORT[mi(mk)]}
                </th>
              ))}
              <th className="acc">{compDim === "pais" ? yr : "Acum."}</th>
            </tr>
          </thead>
          <tbody>
            {compDim === "pais"
              ? rowsPais.length === 0
                ? (
                  <tr>
                    <td className="desc">—</td>
                    <td
                      className="pbi-na"
                      colSpan={months.length + 1}
                      style={{ textAlign: "left" }}
                    >
                      Sin datos registrados para este indicador en {yr}.
                    </td>
                  </tr>
                )
                : rowsPais.map((pp) => (
                    <tr key={pp}>
                      <td className="desc">{pp}</td>
                      {months.map((mk) =>
                        numCell(compDisp(compKey, pp, mk), dec, `${pp}-${mk}`),
                      )}
                      {accCellC(compAcumV(compKey, pp, months), dec, `${pp}-acc`)}
                    </tr>
                  ))
              : rowsAnio.map((y) => {
                  const ms = monthsOf(y);
                  return (
                    <tr key={y}>
                      <td className="desc">{y}</td>
                      {ms.map((mk) =>
                        numCell(compDisp(compKey, vistaEff, mk), dec, `${y}-${mk}`),
                      )}
                      {accCellC(compAcumV(compKey, vistaEff, ms), dec, `${y}-acc`)}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

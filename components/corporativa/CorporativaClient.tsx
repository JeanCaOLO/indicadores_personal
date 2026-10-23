"use client";
// =============================================================================
// components/corporativa/CorporativaClient.tsx  (tarea 14.2)
//
// CLIENT COMPONENT que arma la MATRIZ CORPORATIVA anual (estilo reporte PowerBI)
// corriendo el motor (`core/compute`) por cada mes del año. Porta la lógica de
// `renderPres()` de out/index.html (fuente de verdad), preservando:
//   - Estructura de filas/columnas: filas = indicadores agrupados por .pbi-grp
//     con sus .pbi-child colapsables; columnas = meses (Ene..Dic) + columna
//     acumulada (.acc). La primera columna (.desc) es sticky con el nombre.
//   - La barra .pbi-bar / .pbi-side (país, año) y el .pbi-topsel (grupo).
//   - Las pestañas .pbi-tabs/.pbi-tab (Corporativa / Tipo).
//   - Modo presentación: toggle de la clase `pres-mode` en <body> (Req 7.2).
//   - Impresión (Req 7.3): botón Imprimir/PDF que llama a window.print(); el CSS
//     @media print / @page ya vive en globals.css.
//
// PARIDAD de clases: .pbi, .pbi-bar, .pbi-side, .pbi-sel, .pbi-scroll,
// table.pbi-tbl, thead th, td.desc/.acc, .pbi-grp/.pbi-child/.pbi-hc/.pbi-tot,
// .pbi-exp, .pbi-na, .pbi-tabs/.pbi-tab. Mismo markup → misma apariencia.
//
// RESPETO DE SCOPE (Req 7.1): si `scopeFijado` es true (scope 'pais'), el país
// está fijado y el selector de país se muestra deshabilitado (no selector
// libre). El motor corre siempre con `ctx.pais = pais`.
//
// Navegación de año/país: igual que el sistema actual, se refleja en la URL
// (?anio=&pais=) para que el Server Component recargue el `db` del año elegido.
//
// Lógica portada LÍNEA POR LÍNEA desde renderPres/presCell/presNum/accKPI.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { compute, hasData, kpiOn, M } from "../../core/compute";
import { kpiValid } from "../../core/semaphore";
import { KPI, KMAP, MSHORT, monthsOf, mi, PAISES } from "../../core/kpi-defs";
import type { ComputeContext, ConfigDB, KPI as KpiDef, MonthKey } from "../../core/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Constantes portadas del index.html
// ---------------------------------------------------------------------------

// PRES_HEAD: indicador cabecera por grupo (el que se muestra en la fila .pbi-grp).
const PRES_HEAD: Record<string, string> = {
  Rotación: "rot_total",
  "Reclutamiento y Selección": "nuevos",
  "Ausentismo y bienestar": "ausentismo",
  Capacitación: "cap_horas",
  Desarrollo: "promo",
  "Seguridad y Salud Laboral": "dias_sin_acc",
  "Servicios Generales": "mant",
};

// Acumulado anual de un KPI: niveles/promedios no sumables = valor al cierre,
// Servicios Generales (mant, ot_dias, mant_prev) = promedio, resto = suma.
const LEVEL_K = ["dias_sin_acc", "encuesta", "sucesion", "dias_vacante"];
const AVG_K = ["mant", "ot_dias", "mant_prev"];

// ---------------------------------------------------------------------------
// Helpers de formato (portados de presNum)
// ---------------------------------------------------------------------------

/** `presNum(v,dec)` — redondea a `dec` decimales y formatea en es-CR. */
function presNum(v: number, dec: number): string {
  const r = Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);
  return r.toLocaleString("es-CR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

// ---------------------------------------------------------------------------
// Tipos del componente
// ---------------------------------------------------------------------------

interface CorporativaClientProps {
  db: ConfigDB;
  year: number;
  years: number[];
  pais: string;
  /** true = scope 'pais' (país fijado, selector deshabilitado). */
  scopeFijado: boolean;
  /** `Date.now()` del servidor → ctx.today determinista para el render. */
  today: number;
}

/** Una celda de la matriz: texto a mostrar + flag na (no disponible). */
interface Cell {
  t: string;
  na: boolean;
}

/** Una fila de la matriz. */
interface Row {
  kind: "grp" | "child";
  grp: string; // data-grp (id del grupo colapsable)
  label: string; // nombre (HTML del índice: puede traer la unidad en gris)
  unit?: string; // unidad para pintar "(unidad)" en gris en las child
  cells: Cell[]; // una por mes
  acc: Cell; // columna acumulada
}

/** Un bloque (grupo) ordenable por nombre, con su fila cabecera + detalle. */
interface Block {
  name: string;
  rows: Row[];
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function CorporativaClient({
  db,
  year,
  years,
  pais,
  scopeFijado,
  today,
}: CorporativaClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Grupo seleccionado en el .pbi-topsel (PRES_GRP). Estado local de UI.
  const [grpSel, setGrpSel] = useState<string>("__all__");

  // Grupos colapsados/expandidos (comportamiento de .pbi-grp → toggle .hide en
  // las .pbi-child del mismo data-grp). Por defecto TODOS colapsados (las child
  // arrancan con la clase `hide`, igual que en renderPres).
  const [openGrps, setOpenGrps] = useState<Record<string, boolean>>({});

  // Modo presentación (Req 7.2): togglea body.pres-mode. Por defecto activo al
  // entrar a /corporativa (la vista es una presentación tipo reporte).
  const [presMode, setPresMode] = useState<boolean>(true);

  // Estado de exportación a PDF (deshabilita el botón mientras corre).
  const [pdfBusy, setPdfBusy] = useState<boolean>(false);
  useEffect(() => {
    const body = document.body;
    if (presMode) body.classList.add("pres-mode");
    else body.classList.remove("pres-mode");
    return () => {
      body.classList.remove("pres-mode");
    };
  }, [presMode]);

  // ctx del motor: país según scope/selección, año del dashboard = year.
  const ctx: ComputeContext = useMemo(
    () => ({
      pais,
      dep: "__all__",
      area: "__all__",
      today: new Date(today),
      dashYear: year,
    }),
    [pais, year, today],
  );

  // Las 12 claves "YYYY-MM" del año.
  const months = useMemo(() => monthsOf(year), [year]);

  // ¿Hay algún mes con datos? (anyData). Si no, se muestra el estado vacío.
  const anyData = useMemo(() => months.some((mk) => hasData(mk, db)), [months, db]);

  // Meses con datos (dataMonths) — para los acumulados.
  const dataMonths = useMemo(() => months.filter((mk) => hasData(mk, db)), [months, db]);

  // Índice del mes "actual" (curIdx): en la vista anual no hay mes seleccionado
  // explícito, así que se resalta el mes actual del calendario si cae en el año.
  const curIdx = useMemo(() => {
    const d = new Date(today);
    return d.getFullYear() === year ? d.getMonth() : -1;
  }, [today, year]);

  // -------------------------------------------------------------------------
  // Construcción de la matriz (bloques). Porta renderPres: para cada mes corre
  // compute(mk) y arma la celda con presCell; la columna acumulada usa accKPI /
  // closeOf / avgOf / sumOf según el tipo de fila.
  // -------------------------------------------------------------------------
  const blocks = useMemo<Block[]>(() => {
    if (!anyData) return [];
    return buildBlocks({ db, ctx, months, dataMonths, grpSel });
  }, [db, ctx, months, dataMonths, grpSel, anyData]);

  // -------------------------------------------------------------------------
  // Exportación a PDF (Req 7.3 / tarea 18.1). Arma la matriz head/body a partir
  // de los `blocks` ya calculados (los MISMOS textos que se pintan en pantalla)
  // y la pasa a `downloadPDFCorporativa` (lib/io/export/pdf), que carga jsPDF
  // con dynamic import. La primera columna es la descripción (label) sin el
  // prefijo +/- de expand/colapso; las celdas "na" van vacías (el PDF no pinta
  // el "·" de pantalla). El encabezado replica el de la tabla: Descripción +
  // meses (Ene-24 …) + año acumulado.
  // -------------------------------------------------------------------------
  async function exportarPDF() {
    if (pdfBusy || !anyData) return;
    setPdfBusy(true);
    try {
      const head = [
        "Descripción",
        ...months.map((mk) => `${MSHORT[mi(mk)]}-${mk.slice(2, 4)}`),
        String(year),
      ];
      const body: string[][] = [];
      blocks.forEach((b) => {
        b.rows.forEach((row) => {
          const label =
            row.kind === "child" && row.unit
              ? `${row.label} (${row.unit})`
              : row.label;
          const cells = row.cells.map((c) => (c.na ? "" : c.t));
          const acc = row.acc.na ? "" : row.acc.t;
          body.push([label, ...cells, acc]);
        });
      });
      const { downloadPDFCorporativa } = await import("../../lib/io/export/pdf");
      await downloadPDFCorporativa({ head, body, pais, year });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo exportar el PDF.";
      alert(msg);
    } finally {
      setPdfBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Selectores (barra .pbi-bar / .pbi-topsel): país, año y grupo.
  // País y año se reflejan en la URL (recarga del server component).
  // -------------------------------------------------------------------------
  function pushParam(next: { anio?: number; pais?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.anio != null) params.set("anio", String(next.anio));
    if (next.pais != null) params.set("pais", next.pais);
    router.push(`/corporativa?${params.toString()}`);
  }

  function onPaisChange(v: string) {
    if (scopeFijado) return; // país fijado: selector deshabilitado
    pushParam({ pais: v });
  }
  function onAnioChange(v: number) {
    pushParam({ anio: v });
  }

  function toggleGrp(grp: string) {
    setOpenGrps((prev) => ({ ...prev, [grp]: !prev[grp] }));
  }

  // Países con datos para el selector (equivalente a paisesData/paisOpts). Como
  // acá `db` ya viene filtrado por RLS, se ofrece la lista estándar de países.
  const paisOpciones = scopeFijado ? [pais] : PAISES;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div id="v-pres">
      <div className="pbi">
        {/* Pestañas Corporativa / Tipo (la segunda queda deshabilitada en 14.2). */}
        <div className="pbi-tabs">
          <button className="pbi-tab on" data-sub="matriz" type="button">
            Corporativa
          </button>
          <button
            className="pbi-tab"
            data-sub="tipo"
            type="button"
            title="Vista por tipo (tarea 14.3)"
            disabled
          >
            Tipo
          </button>
        </div>

        {/* Barra superior: Vista (país) · CC · marca · Año */}
        <div className="pbi-bar">
          <div className="pbi-side">
            <span className="lbl">Vista</span>
            <span>
              <select
                className="pbi-sel"
                id="presPais"
                value={pais}
                disabled={scopeFijado}
                onChange={(e) => onPaisChange(e.target.value)}
                aria-label="País"
              >
                <option value="__all__">Consolidado</option>
                {paisOpciones
                  .filter((pp) => pp !== "__all__")
                  .map((pp) => (
                    <option key={pp} value={pp}>
                      {pp}
                    </option>
                  ))}
              </select>
            </span>
            <span className="lbl">CC</span>
            <span className="val">OLO</span>
          </div>

          <div className="pbi-mark">
            <svg width="70" height="30" viewBox="0 0 70 30" aria-label="OLO">
              <rect x="1" y="4" width="20" height="20" rx="2" fill="none" stroke="#3a3a3a" strokeWidth="3" />
              <rect x="27" y="4" width="6" height="20" fill="#3a3a3a" />
              <rect x="41" y="4" width="20" height="20" rx="2" fill="#00A885" />
            </svg>
          </div>

          <div className="pbi-side r">
            <span className="lbl">Año</span>
            <span>
              <select
                className="pbi-sel"
                id="presAnio"
                value={year}
                onChange={(e) => onAnioChange(+e.target.value)}
                aria-label="Año"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>

        {/* Selector de grupo (.pbi-topsel) + acciones de presentación/impresión */}
        <div className="pbi-topsel">
          <select
            className="pbi-sel"
            id="presGrp"
            value={grpSel}
            onChange={(e) => setGrpSel(e.target.value)}
            aria-label="Grupo"
          >
            <option value="__all__">Todas</option>
            <option value="Horas hombre">Horas hombre</option>
            {KPI.map((g) => (
              <option key={g.g} value={g.g}>
                {g.g}
              </option>
            ))}
            <option value="Perfil del colaborador">Perfil del colaborador</option>
          </select>
        </div>

        {/* Acciones (ocultas al imprimir vía .hactions en @media print) */}
        <div className="hactions" style={{ display: "flex", gap: 8, justifyContent: "flex-end", margin: "0 0 10px" }}>
          <button
            type="button"
            className="pbi-tab"
            onClick={() => setPresMode((v) => !v)}
            aria-pressed={presMode}
          >
            {presMode ? "Salir de presentación" : "Modo presentación"}
          </button>
          <button type="button" className="pbi-tab" onClick={() => window.print()}>
            Imprimir
          </button>
          <button
            type="button"
            className="pbi-tab"
            disabled={!anyData || pdfBusy}
            onClick={exportarPDF}
          >
            {pdfBusy ? "… PDF" : "⬇ PDF"}
          </button>
        </div>

        {!anyData ? (
          <div
            className="empty"
            style={{ border: "1px solid #cdcdcd", background: "#fff", padding: "34px 20px" }}
          >
            <b>Sin datos registrados en {year}</b>
            <br />
            Cargá los meses del ejercicio en «Administrar datos».
          </div>
        ) : (
          <div className="pbi-scroll">
            <table className="pbi-tbl">
              <thead>
                <tr>
                  <th className="desc">
                    Descripción <span className="pbi-caret">▲</span>
                  </th>
                  {months.map((mk, i) => (
                    <th key={mk} className={i === curIdx ? "cur" : ""}>
                      {MSHORT[mi(mk)]}-{mk.slice(2, 4)}
                    </th>
                  ))}
                  <th className="acc">{year}</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) =>
                  b.rows.map((row, ri) => {
                    const open = !!openGrps[row.grp];
                    if (row.kind === "grp") {
                      return (
                        <tr
                          key={`${b.name}-g-${ri}`}
                          className={`pbi-grp${open ? " open" : ""}`}
                          data-grp={row.grp}
                          onClick={() => toggleGrp(row.grp)}
                        >
                          <td className="desc">
                            <span className="pbi-exp">{open ? "−" : "+"}</span>
                            {row.label}
                          </td>
                          {row.cells.map((c, i) => (
                            <td key={i} className={`${i === curIdx ? "cur" : ""} ${c.na ? "pbi-na" : ""}`}>
                              {c.na ? "·" : c.t || "·"}
                            </td>
                          ))}
                          <td className={`acc ${row.acc.na ? "pbi-na" : ""}`}>
                            {row.acc.na ? "·" : row.acc.t || "·"}
                          </td>
                        </tr>
                      );
                    }
                    // child
                    return (
                      <tr
                        key={`${b.name}-c-${ri}`}
                        className={`pbi-child${open ? "" : " hide"}`}
                        data-grp={row.grp}
                      >
                        <td className="desc">
                          {row.label}
                          {row.unit ? <span style={{ color: "#aaa" }}> ({row.unit})</span> : null}
                        </td>
                        {row.cells.map((c, i) => (
                          <td key={i} className={`${i === curIdx ? "cur" : ""} ${c.na ? "pbi-na" : ""}`}>
                            {c.na ? "·" : c.t || "·"}
                          </td>
                        ))}
                        <td className={`acc ${row.acc.na ? "pbi-na" : ""}`}>
                          {row.acc.na ? "·" : row.acc.t || "·"}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// buildBlocks — porta la construcción de filas de renderPres.
// Devuelve bloques ordenados por nombre (localeCompare "es"), cada uno con su
// fila .pbi-grp (cabecera) seguida de sus filas .pbi-child (detalle).
// ===========================================================================

interface BuildArgs {
  db: ConfigDB;
  ctx: ComputeContext;
  months: MonthKey[];
  dataMonths: MonthKey[];
  grpSel: string;
}

function buildBlocks({ db, ctx, months, dataMonths, grpSel }: BuildArgs): Block[] {
  // Cache de compute por mes (compute es puro; cada mes se calcula una vez).
  const computeCache = new Map<string, any>();
  const C = (mk: MonthKey) => {
    let c = computeCache.get(mk);
    if (!c) {
      c = compute(mk, db, ctx);
      computeCache.set(mk, c);
    }
    return c;
  };

  // --- helpers de agregación (idénticos a renderPres) ---
  const avgOf = (getFn: (mk: MonthKey) => number | null): number | null => {
    let s = 0,
      n = 0;
    dataMonths.forEach((mk) => {
      const x = getFn(mk);
      if (x != null && !isNaN(x) && Math.abs(x) > 1e-9) {
        s += x;
        n++;
      }
    });
    return n ? s / n : null;
  };
  const closeOf = (getFn: (mk: MonthKey) => number | null): number | null => {
    for (let i = dataMonths.length - 1; i >= 0; i--) {
      const x = getFn(dataMonths[i]);
      if (x != null && !isNaN(x) && Math.abs(x) > 1e-9) return x;
    }
    return null;
  };
  const maxOf = (getFn: (mk: MonthKey) => number | null): number | null => {
    let m: number | null = null;
    dataMonths.forEach((mk) => {
      const x = getFn(mk);
      if (x != null && !isNaN(x) && Math.abs(x) > 1e-9) {
        if (m == null || x > m) m = x;
      }
    });
    return m;
  };
  const sumOf = (getFn: (mk: MonthKey) => number | null): number | null => {
    let s = 0,
      any = false;
    dataMonths.forEach((mk) => {
      const x = getFn(mk);
      if (x != null && !isNaN(x)) {
        s += x;
        any = true;
      }
    });
    return any ? s : null;
  };

  // accKPI(it) — acumulado anual de un indicador KPI.
  const accKPI = (it: KpiDef): number | null => {
    if (!dataMonths.length) return null;
    const k = it.k;
    if (k === "record_dias") return maxOf((mk) => C(mk).ind[k]);
    if (AVG_K.includes(k)) return avgOf((mk) => C(mk).ind[k]);
    if (LEVEL_K.includes(k)) return closeOf((mk) => C(mk).ind[k]);
    let s = 0,
      any = false;
    dataMonths.forEach((mk) => {
      const v = C(mk).ind[k];
      if (v != null && !isNaN(v)) {
        s += v;
        any = true;
      }
    });
    return any ? s : null;
  };
  const accType = (it: KpiDef): number | null => {
    const v = accKPI(it);
    if (v == null || isNaN(v)) return null;
    return it.type === "pct" ? v * 100 : v;
  };
  const accDec = (it: KpiDef): number => (it.type === "pct" ? 1 : it.type === "int" ? 0 : 1);

  // presCell(it,mk) — valor de una celda del indicador `it` en el mes `mk`.
  const presCell = (it: KpiDef, mk: MonthKey): Cell => {
    if (!hasData(mk, db)) return { t: "", na: true };
    const c = C(mk);
    let ok: boolean;
    try {
      ok = it.info || it.esl ? c.ind[it.k] != null : kpiValid(it.k, c as any, kpiValidCtx(db, mk));
    } catch {
      ok = true;
    }
    if (ok && it.k === "dias_sin_acc") {
      const p = (db[mk] && (db[mk] as any).params) || {};
      ok = !!p.fecha_ult_accidente; // no arrastrar la fecha global
    }
    const v = c.ind[it.k];
    if (!ok || v == null || isNaN(v)) return { t: "", na: true };
    const disp = it.type === "pct" ? v * 100 : v;
    const dec = it.type === "int" ? 0 : 1;
    if (Math.abs(disp) < Math.pow(10, -dec) / 2) return { t: "", na: true };
    return { t: presNum(disp, dec), na: false };
  };

  // numCell(v,dec) / accCell(v,dec) para filas "extra" (colaboradores, hh, perfil).
  const numCell = (v: number | null, dec: number): Cell => {
    const na = v == null || isNaN(v as number) || Math.abs(v as number) < Math.pow(10, -dec) / 2;
    return na ? { t: "", na: true } : { t: presNum(v as number, dec), na: false };
  };
  const accCellOf = (v: number | null, dec: number): Cell => {
    const na = v == null || isNaN(v as number) || Math.abs(v as number) < Math.pow(10, -dec) / 2;
    return na ? { t: "", na: true } : { t: presNum(v as number, dec), na: false };
  };

  const blocks: Block[] = [];

  // ---- Colaboradores (Nómina + Terceros) — acum = cierre ----
  {
    const terc = (mk: MonthKey): number => {
      if (!hasData(mk, db)) return 0;
      return (M(mk, db).terceros || [])
        .filter((x: any) => ctx.pais === "__all__" || x.pais === ctx.pais)
        .reduce((s: number, x: any) => s + (+x.cantidad || 0), 0);
    };
    const olo = (mk: MonthKey): number | null => (hasData(mk, db) ? C(mk).hcTot : null);
    const colabTot = (mk: MonthKey): number | null => {
      if (!hasData(mk, db)) return null;
      return (C(mk).hcTot || 0) + terc(mk);
    };
    const rows: Row[] = [];
    rows.push({
      kind: "grp",
      grp: "colab",
      label: "Colaboradores",
      cells: months.map((mk) => numCell(colabTot(mk), 0)),
      acc: accCellOf(closeOf(colabTot), 0),
    });
    [
      { name: "Nómina", get: olo },
      { name: "Terceros", get: (mk: MonthKey) => (hasData(mk, db) ? terc(mk) : null) },
    ]
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .forEach((e) => {
        rows.push({
          kind: "child",
          grp: "colab",
          label: e.name,
          cells: months.map((mk) => numCell(e.get(mk), 0)),
          acc: accCellOf(closeOf(e.get), 0),
        });
      });
    blocks.push({ name: "Colaboradores", rows });
  }

  // ---- Horas hombre (Total → Ordinarias · Extras) — acum = suma ----
  if (grpSel === "__all__" || grpSel === "Horas hombre") {
    const hhTot = (mk: MonthKey): number | null => {
      if (!hasData(mk, db)) return null;
      const p: any = M(mk, db).params;
      return (+p.horas_hombre || 0) || (+p.hh_ord || 0) + (+p.hh_ext || 0) || C(mk).extrasTot || null;
    };
    const hhExt = (mk: MonthKey): number | null => {
      if (!hasData(mk, db)) return null;
      const p: any = M(mk, db).params;
      return (+p.hh_ext || 0) || C(mk).extrasTot || null;
    };
    const hhOrd = (mk: MonthKey): number | null =>
      hasData(mk, db) ? (+(M(mk, db).params as any).hh_ord || 0) || null : null;

    const rows: Row[] = [];
    rows.push({
      kind: "grp",
      grp: "hh",
      label: "Horas hombre",
      cells: months.map((mk) => numCell(hhTot(mk), 0)),
      acc: accCellOf(sumOf(hhTot), 0),
    });
    [
      { name: "Horas ordinarias (h)", get: hhOrd },
      { name: "Horas extras (h)", get: hhExt },
    ]
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .forEach((e) => {
        rows.push({
          kind: "child",
          grp: "hh",
          label: e.name,
          cells: months.map((mk) => numCell(e.get(mk), 0)),
          acc: accCellOf(sumOf(e.get), 0),
        });
      });
    blocks.push({ name: "Horas hombre", rows });
  }

  // ---- Grupos del catálogo KPI ----
  const groups = KPI.filter((g) => grpSel === "__all__" || g.g === grpSel)
    .slice()
    .sort((a, b) => a.g.localeCompare(b.g, "es"));

  groups.forEach((g, gi) => {
    const its = g.items
      .filter((it) => kpiOn(it.k, db))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (!its.length) return;

    let headIt = KMAP[PRES_HEAD[g.g]];
    if (!headIt || !kpiOn(headIt.k, db)) headIt = its.find((it) => !it.info && !it.esl) || its[0];

    const gname = g.g ? g.g.charAt(0).toUpperCase() + g.g.slice(1).toLowerCase() : g.g;
    const grpId = String(gi);
    const rows: Row[] = [];

    // fila cabecera (.pbi-grp) con el indicador cabecera
    rows.push({
      kind: "grp",
      grp: grpId,
      label: gname,
      cells: months.map((mk) => presCell(headIt, mk)),
      acc: accCellOf(accType(headIt), accDec(headIt)),
    });

    // filas detalle (indicadores del grupo)
    its.forEach((it) => {
      rows.push({
        kind: "child",
        grp: grpId,
        label: it.name,
        unit: it.unit || undefined,
        cells: months.map((mk) => presCell(it, mk)),
        acc: accCellOf(accType(it), accDec(it)),
      });
    });

    blocks.push({ name: gname, rows });
  });

  // ---- Perfil del colaborador (edad / antigüedad) — acum = promedio ----
  if (grpSel === "__all__" || grpSel === "Perfil del colaborador") {
    const edad = (mk: MonthKey): number | null => (hasData(mk, db) ? C(mk).edadProm : null);
    const antig = (mk: MonthKey): number | null => (hasData(mk, db) ? C(mk).antigProm : null);
    const rows: Row[] = [];
    rows.push({
      kind: "grp",
      grp: "perfil",
      label: "Perfil del colaborador",
      cells: months.map((mk) => numCell(edad(mk), 1)),
      acc: accCellOf(avgOf(edad), 1),
    });
    [
      { name: "Edad promedio (años)", get: edad },
      { name: "Antigüedad promedio (años)", get: antig },
    ]
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .forEach((e) => {
        rows.push({
          kind: "child",
          grp: "perfil",
          label: e.name,
          cells: months.map((mk) => numCell(e.get(mk), 1)),
          acc: accCellOf(avgOf(e.get), 1),
        });
      });
    blocks.push({ name: "Perfil del colaborador", rows });
  }

  // Orden final de bloques por nombre (igual que renderPres).
  blocks.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return blocks;
}

// ---------------------------------------------------------------------------
// kpiValidCtx — arma el KpiValidContext que core/semaphore.kpiValid necesita.
// Reemplaza los globales del index (M(CUR).params, DB.__cfg.satisfaccion,
// CUR.slice(0,4), hasData(CUR)).
// ---------------------------------------------------------------------------
function kpiValidCtx(db: ConfigDB, mk: MonthKey) {
  return {
    params: M(mk, db).params,
    satisfaccion: (db.__cfg && db.__cfg.satisfaccion) || {},
    year: mk.slice(0, 4),
    hasData: hasData(mk, db),
  } as any;
}

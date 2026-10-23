// lib/io/export/pdf.ts
//
// Exportación a PDF. Portado desde la fuente de verdad `out/index.html` (solo
// lectura, no modificar), funciones:
//
//   function downloadPDFOperativa(){...}   → aquí downloadPDFOperativa(...)
//   function downloadPDF(){...}            → aquí downloadPDFCorporativa(...)
//
// Se portan PRESERVANDO contenido y disposición (orientación, título, columnas,
// estilos de autotable: headStyles teal [0,168,140], tema grid, tamaños de
// fuente, cellPadding, columnStyles y márgenes idénticos a los del sistema
// actual).
//
// ─────────────────────────────────────────────────────────────────────────
// DESACOPLE DE GLOBALES (igual que la exportación a Excel, tarea 17.1):
//   · DB      → parámetro `db: ConfigDB`
//   · CUR     → parámetro `mes: MonthKey`
//   · PAIS    → parámetro `pais: string` ("__all__" | "Costa Rica" | ...)
//   · TODAY   → `ctx: ComputeContext` (compute recibe ctx.today, ctx.dashYear…)
// La vista operativa (14.1) y la corporativa (14.2) llaman a estas funciones
// pasándoles sus datos ya resueltos, sin tocar `window`/DOM.
//
// ─────────────────────────────────────────────────────────────────────────
// API jsPDF v4 / jspdf-autotable v5 (versiones instaladas: jspdf 4.2.1,
// jspdf-autotable 5.0.9). La API cambió respecto del sistema actual (CDN jspdf
// 2.5 + autotable 3.8, que usaba `doc.autoTable({...})`):
//   · jsPDF v4 exporta `jsPDF` como NAMED export:
//       const { jsPDF } = await import("jspdf");
//   · autotable v5 exporta la función como DEFAULT export y se invoca como
//     `autoTable(doc, {...})` (NO `doc.autoTable(...)`):
//       const autoTable = (await import("jspdf-autotable")).default;
//       autoTable(doc, { head, body, ... });
// Ambas con DYNAMIC IMPORT (client-side) para no inflar el bundle: la librería
// solo se descarga cuando el usuario realmente exporta un PDF.
//
// ─────────────────────────────────────────────────────────────────────────
// HELPERS (_xlsVal / _kpiAt / _fmtX / _extraMetrics): se REPLICAN localmente
// (versión desacoplada de globales) porque la tarea 17.1 (lib/io/export/xlsx.ts)
// todavía no los exporta. UNIFICACIÓN POSTERIOR sugerida: cuando 17.1 exporte
// estos helpers (p.ej. desde lib/io/export/shared.ts o xlsx.ts), importarlos
// desde allí y eliminar las copias de este archivo.

import { compute } from "@/core/compute";
import { KPI, MSHORT, mi } from "@/core/kpi-defs";
import { kpiValid } from "@/core/semaphore";
import type { ComputeContext, ConfigDB, KPI as KpiDef, MonthKey } from "@/core/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ===========================================================================
// Niveles educativos (const EDUC en out/index.html). No se exporta desde core,
// así que se replica aquí (mismo orden y valores).
// ===========================================================================
const EDUC: readonly string[] = ["Primaria", "Secundaria", "Técnico", "Universitario", "Posgrado"];

// ===========================================================================
// hasData — port local (lectura pura, con filtro de país) del `hasData` global.
// El `hasData` de core/compute no filtra por país; aquí replicamos la forma del
// original (que leía DB[k] global ya con el país activo) determinando si el mes
// tiene registros para el país pedido.
// Nota: para la exportación basta con el `hasData` del motor; usamos el de core.
// ===========================================================================
import { hasData as coreHasData, M } from "@/core/compute";

// ---------------------------------------------------------------------------
// _xlsVal(it,v) — formato del VALOR de un KPI para la celda exportada.
//   function _xlsVal(it,v){if(v==null||isNaN(v))return "";
//     if(it.type==="pct")return +(v*100).toFixed(1);
//     if(it.type==="int")return Math.round(v);
//     return +(+v).toFixed(1);}
// ---------------------------------------------------------------------------
function _xlsVal(it: KpiDef, v: any): number | string {
  if (v == null || isNaN(v)) return "";
  if (it.type === "pct") return +(v * 100).toFixed(1);
  if (it.type === "int") return Math.round(v);
  return +(+v).toFixed(1);
}

// ---------------------------------------------------------------------------
// _fmtX(dec,v) — formato de las métricas de perfil (edad/antigüedad/conteos).
//   function _fmtX(dec,v){if(v===""||v==null||isNaN(+v))return "";
//     return dec?+(+v).toFixed(dec):Math.round(+v);}
// ---------------------------------------------------------------------------
function _fmtX(dec: number, v: any): number | string {
  if (v === "" || v == null || isNaN(+v)) return "";
  return dec ? +(+v).toFixed(dec) : Math.round(+v);
}

// ---------------------------------------------------------------------------
// _kpiAt(it,mk) — valor del KPI `it` en el mes `mk`, o null si no es válido.
// Port de:
//   function _kpiAt(it,mk){if(!hasData(mk))return null;const _C=CUR;CUR=mk;
//     const c=compute(mk);let ok;
//     try{ok=(it.info||it.esl)?(c.ind[it.k]!=null):kpiValid(it.k,c);}catch(e){ok=false;}
//     if(ok&&it.k==="dias_sin_acc"){const p=(DB[mk]&&DB[mk].params)||{};ok=!!p.fecha_ult_accidente;}
//     const v=c.ind[it.k];CUR=_C;return ok?v:null;}
// Desacople: recibe db/pais/ctx; compute(mk,db,ctx); kpiValid(key,c,validCtx).
// ---------------------------------------------------------------------------
function _kpiAt(it: KpiDef, mk: MonthKey, db: ConfigDB, pais: string, ctx: ComputeContext): number | null {
  if (!coreHasData(mk, db)) return null;
  const mctx: ComputeContext = { ...ctx, pais, dashYear: +mk.slice(0, 4) };
  const c = compute(mk, db, mctx);
  let ok: boolean;
  try {
    ok =
      it.info || it.esl
        ? c.ind[it.k] != null
        : kpiValid(it.k, c as any, {
            params: M(mk, db).params,
            satisfaccion: (db.__cfg && db.__cfg.satisfaccion) || {},
            year: mk.slice(0, 4),
            hasData: coreHasData(mk, db),
          });
  } catch {
    ok = false;
  }
  if (ok && it.k === "dias_sin_acc") {
    const p: any = (db[mk] && (db[mk] as any).params) || {};
    ok = !!p.fecha_ult_accidente;
  }
  const v = c.ind[it.k];
  return ok ? (v as number | null) : null;
}

// ---------------------------------------------------------------------------
// _extraMetrics(mk) — métricas de perfil, horas hombre, nivel educativo,
// movilidad y terceros para el mes `mk`.
// Port de:
//   function _extraMetrics(mk){const has=hasData(mk);let c=null,p={},terc=0;
//     if(has){...c=compute(mk);p=(DB[mk]&&DB[mk].params)||{};
//       terc=(M(mk).terceros||[]).filter(x=>PAIS==="__all__"||(x.pais||"")===PAIS)
//         .reduce((s,x)=>s+(+x.cantidad||0),0);}
//     const sx=(c&&c.sexoC)||{},ed=(c&&c.educC)||{},mv=(c&&c.movMC)||{};
//     const g=(o,ks)=>ks.reduce((s,k)=>s+(+(o[k]||0)),0);
//     const hh=((+p.hh_ord||0)+(+p.hh_ext||0))||(+p.horas_hombre||0);
//     const rows=[];const add=(grp,name,unit,dec,val)=>rows.push([grp,name,unit,dec,has?val:""]);
//     ... }
// Devuelve filas [grupo, nombre, unidad, dec, valor].
// ---------------------------------------------------------------------------
function _extraMetrics(mk: MonthKey, db: ConfigDB, pais: string, ctx: ComputeContext): [string, string, string, number, any][] {
  const has = coreHasData(mk, db);
  let c: any = null,
    p: any = {},
    terc = 0;
  if (has) {
    const mctx: ComputeContext = { ...ctx, pais, dashYear: +mk.slice(0, 4) };
    c = compute(mk, db, mctx);
    p = (db[mk] && (db[mk] as any).params) || {};
    terc = (M(mk, db).terceros || [])
      .filter((x: any) => pais === "__all__" || (x.pais || "") === pais)
      .reduce((s: number, x: any) => s + (+x.cantidad || 0), 0);
  }
  const sx: any = (c && c.sexoC) || {},
    ed: any = (c && c.educC) || {},
    mv: any = (c && c.movMC) || {};
  const g = (o: any, ks: string[]) => ks.reduce((s, k) => s + +(o[k] || 0), 0);
  const hh = (+p.hh_ord || 0) + (+p.hh_ext || 0) || +p.horas_hombre || 0;
  const rows: [string, string, string, number, any][] = [];
  const add = (grp: string, name: string, unit: string, dec: number, val: any) => rows.push([grp, name, unit, dec, has ? val : ""]);
  add("Perfil", "Edad promedio", "años", 1, c ? c.edadProm : "");
  add("Perfil", "Antigüedad promedio", "años", 1, c ? c.antigProm : "");
  add("Perfil", "Mujeres", "", 0, g(sx, ["F", "Femenino", "Mujer", "f"]));
  add("Perfil", "Hombres", "", 0, g(sx, ["M", "Masculino", "Hombre", "m"]));
  add("Horas hombre", "Horas hombre (total)", "h", 0, hh);
  add("Horas hombre", "Horas ordinarias", "h", 0, +p.hh_ord || 0);
  add("Horas hombre", "Horas extras", "h", 0, +p.hh_ext || 0);
  EDUC.forEach((e) => add("Nivel educativo", e, "", 0, ed[e] || 0));
  ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M7 NN"].forEach((m) => add("Movilidad", m, "", 0, mv[m] || 0));
  add("Terceros", "Terceros", "", 0, terc);
  return rows;
}

// ===========================================================================
// Carga perezosa (dynamic import) de jsPDF v4 + autotable v5.
// ===========================================================================
type JsPDFCtor = typeof import("jspdf").jsPDF;
type AutoTableFn = typeof import("jspdf-autotable").default;

async function loadPdf(): Promise<{ jsPDF: JsPDFCtor; autoTable: AutoTableFn }> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  return { jsPDF, autoTable };
}

// ===========================================================================
// downloadPDFOperativa — PDF VERTICAL (A4 portrait) de la Vista Operativa.
//
// Firma: downloadPDFOperativa({ db, mes, pais, ctx })
//   · db   : ConfigDB con el/los meses necesarios y __cfg.
//   · mes  : MonthKey "YYYY-MM" a exportar (el período actual del dashboard).
//   · pais : "__all__" (Consolidado) | "Costa Rica" | "Venezuela" | …
//   · ctx  : ComputeContext (today, dep, area; pais/dashYear se derivan del mes).
//
// Contenido/disposición idénticos al sistema actual:
//   - Tabla "Grupo / Indicador / Unidad / Valor".
//   - Primera fila: Colaboradores (nómina) = compute(mes).hcTot (si > 0).
//   - Luego cada KPI del catálogo (KPI → g.items) con su valor (_kpiAt/_xlsVal).
//   - Luego las métricas de perfil/horas hombre/nivel/movilidad/terceros
//     (_extraMetrics → _fmtX).
//   - Título "OLO · Indicadores de personal — Vista Operativa"; línea con país
//     ("Consolidado" si "__all__") + período (MSHORT[mi(mes)] + año).
//   - autotable: theme grid, fontSize 8, cellPadding 3, headStyles teal, anchos
//     de columna 130/230/45(center)/right, margin 40.
//
// Port de `function downloadPDFOperativa(){...}` de out/index.html.
// ===========================================================================
export async function downloadPDFOperativa(args: { db: ConfigDB; mes: MonthKey; pais: string; ctx: ComputeContext }): Promise<void> {
  const { db, mes, pais, ctx } = args;
  const { jsPDF, autoTable } = await loadPdf();
  const paisLbl = pais === "__all__" ? "Consolidado" : pais;
  const mctx: ComputeContext = { ...ctx, pais, dashYear: +mes.slice(0, 4) };

  const body: any[][] = [];
  const hc = coreHasData(mes, db) ? (compute(mes, db, mctx).hcTot as number) : null;
  body.push(["Colaboradores", "Colaboradores (nómina)", "", hc && hc > 0 ? String(hc) : ""]);
  KPI.forEach((g) =>
    g.items.forEach((it) => {
      const v = _kpiAt(it, mes, db, pais, ctx);
      body.push([g.g, it.name, it.type === "pct" ? "%" : it.unit || "", v == null ? "" : String(_xlsVal(it, v))]);
    }),
  );
  _extraMetrics(mes, db, pais, ctx).forEach((r) => body.push([r[0], r[1], r[2], String(_fmtX(r[3], r[4]))]));

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(13);
  doc.text("OLO · Indicadores de personal — Vista Operativa", 40, 40);
  doc.setFontSize(10);
  doc.text("País: " + paisLbl + "     Período: " + MSHORT[mi(mes)] + " " + mes.slice(0, 4), 40, 56);
  autoTable(doc, {
    head: [["Grupo", "Indicador", "Unidad", "Valor"]],
    body,
    startY: 68,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [0, 168, 140], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 230 },
      2: { cellWidth: 45, halign: "center" },
      3: { halign: "right" },
    },
    margin: { left: 40, right: 40 },
  });
  doc.save("OLO_Operativa_" + paisLbl.replace(/\s+/g, "_") + "_" + mes + ".pdf");
}

// ===========================================================================
// downloadPDFCorporativa — PDF HORIZONTAL (A4 landscape) de la Vista Corporativa.
//
// En el sistema actual (`downloadPDF`), la matriz corporativa se leía del DOM
// (`#v-pres table.pbi-tbl`: encabezados `thead th` y filas `tbody tr`, quitando
// el prefijo de expand/colapso `+`/`-`/`−`). Aquí la vista corporativa es React,
// así que esta función se DESACOPLA del DOM: recibe la matriz YA calculada.
//
// Firma: downloadPDFCorporativa({ head, body, pais, year })
//   · head : string[]       → fila de encabezado (p.ej. ["Indicador","Ene-24",…,"Acum."]).
//                             La primera columna es la descripción del indicador.
//   · body : string[][]     → filas de la matriz; cada fila es un array de celdas
//                             de texto YA formateadas, SIN el prefijo "+/-/−".
//   · pais : string         → "__all__" (Consolidado) | nombre de país.
//   · year : number|string  → año de la matriz (YEAR del sistema actual).
//
// La Vista Corporativa (tarea 14.2, MatrizCorporativa) debe llamar a esta
// función pasándole su matriz de filas/columnas (los mismos textos que pinta en
// pantalla, con el "+"/"−" de expand/colapso ya removido de la 1ª columna).
//
// Disposición idéntica al sistema actual:
//   - Título "OLO · Indicadores de personal — Vista Corporativa"; línea país + año.
//   - autotable: theme grid, fontSize 7, cellPadding 2, headStyles teal, primera
//     columna izquierda/negrita/ancho 150, margin 30.
//
// Port de `function downloadPDF(){...}` (rama corporativa) de out/index.html.
// ===========================================================================
export async function downloadPDFCorporativa(args: { head: string[]; body: string[][]; pais: string; year: number | string }): Promise<void> {
  const { head, body, pais, year } = args;
  const { jsPDF, autoTable } = await loadPdf();
  // Defensa: replica el stripeo del prefijo de expand/colapso que hacía el index
  // al leer el DOM (`.replace(/^[+\-−]\s*/,'')`), por si la vista no lo removió.
  const cleanBody = body.map((row) => row.map((cell, i) => (i === 0 ? String(cell ?? "").replace(/^[+\-−]\s*/, "").trim() : String(cell ?? "").trim())));
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const paisLbl = pais === "__all__" ? "Consolidado" : pais;
  doc.setFontSize(13);
  doc.text("OLO · Indicadores de personal — Vista Corporativa", 40, 34);
  doc.setFontSize(10);
  doc.text("País: " + paisLbl + "     Año: " + year, 40, 50);
  autoTable(doc, {
    head: [head],
    body: cleanBody,
    startY: 60,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [0, 168, 140], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { halign: "left", cellWidth: 150, fontStyle: "bold" } },
    margin: { left: 30, right: 30 },
  });
  doc.save("OLO_Corporativa_" + paisLbl.replace(/\s+/g, "_") + "_" + year + ".pdf");
}

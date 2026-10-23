// lib/io/import/parse-rows.ts
//
// Parseo de matrices (unknown[][]) a objetos por entidad. Portado LÍNEA POR
// LÍNEA desde out/index.html (fuente de verdad):
//
//   function headRow(mat){...}
//   function parseRows(kind,mat){...}
//   function monthKeyFrom(a,m){...}
//
// Diferencias controladas respecto del index (documentadas):
//   - El index usa los globales CUR, PAIS y ROLE. Aquí se pasan como OPCIONES
//     (ParseOptions) para no depender de globals del DOM/estado:
//       · mesActual  ← CUR   (clave de mes por defecto cuando la fila no trae AÑO/MES)
//       · paisCarga  ← resultado de cargaPais() (país que se fuerza/completa)
//       · rolPais    ← ROLE  (si el usuario es de un país, se FUERZA ese país)
//     La semántica "carga por país" se preserva exactamente: un usuario de país
//     (rolPais distinto de "__all__") no puede inyectar otro país; un global
//     completa con `paisCarga` las filas sin país.
//   - parseRows acumula además un reporte de campos requeridos faltantes
//     (Req 9.6) en `result.faltantes`, sin alterar el mapeo de filas.
//
// resolveIdx / idxAnio / idxMes NO se duplican: se importan de field-alias.ts.
//
// Módulo puro (sin DOM, sin globals).

import { COLMAP, type ColmapKind } from "./colmap";
import { resolveIdx, idxAnio, idxMes } from "./field-alias";
import { normVal, NA } from "./normval";
import { MLONG } from "../../../core/kpi-defs";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Matriz cruda de una hoja: filas de celdas (número, texto, Date, null, …). */
export type Matrix = unknown[][];

/** Fila parseada: objeto campo→valor normalizado, más la clave de mes destino. */
export interface ParsedRow {
  /** Clave de mes "YYYY-MM" a la que pertenece la fila. */
  key: string;
  /** Objeto con los campos del `kind` ya normalizados con normVal. */
  o: Record<string, string>;
}

/**
 * Opciones de parseo. Reemplazan los globals del index (CUR/PAIS/ROLE) por
 * parámetros explícitos.
 */
export interface ParseOptions {
  /**
   * Mes actual "YYYY-MM" (equivale a `CUR`). Es la clave de mes por defecto
   * cuando la fila no trae columnas AÑO/MES reconocibles.
   */
  mesActual: string;
  /**
   * País de carga efectivo (equivale a `cargaPais()`). Si la fila no trae país
   * y el usuario es global, se completa con este valor. Cadena vacía = sin
   * país de carga (global en "Todos").
   */
  paisCarga?: string;
  /**
   * Rol/país del usuario (equivale a `ROLE`). Si es distinto de "__all__", se
   * FUERZA este país en cada fila (el usuario de país no puede inyectar otro).
   * Omitir o "__all__" ⇒ usuario global.
   */
  rolPais?: string;
}

/** Resultado de parseRows: filas parseadas + reporte de campos faltantes. */
export interface ParseResult {
  /** Tipo de plantilla parseada. */
  kind: ColmapKind;
  /** Filas parseadas (con su clave de mes). */
  rows: ParsedRow[];
  /**
   * Campos requeridos del `kind` para los que NO se reconoció ninguna columna
   * (Req 9.6). Vacío ⇒ todas las columnas requeridas estaban presentes.
   */
  faltantes: string[];
}

// ---------------------------------------------------------------------------
// Campos requeridos por tipo de plantilla (Req 9.6).
//
// El index no mantiene una lista explícita de campos "requeridos"; el aviso de
// campo faltante se arma a nivel de UI. Aquí declaramos el subconjunto mínimo
// de columnas que cada hoja DEBE tener para producir registros útiles, de modo
// que la capa superior pueda informar al usuario cuál columna falta. El resto
// de campos del COLMAP se consideran opcionales (se completan con "").
// ---------------------------------------------------------------------------
const REQUIRED_FIELDS: Record<ColmapKind, string[]> = {
  activos: ["id", "fecha_ingreso"],
  egresos: ["id", "fecha_salida"],
  ausencias: ["dias"],
  vacaciones: ["dias"],
  extras: ["horas"],
  capacitacion: ["horas"],
  merma: ["cantidad"],
  terceros: ["cantidad"],
  areas: ["area"],
};

// ---------------------------------------------------------------------------
// headRow — detecta la fila de encabezado dentro de las primeras 6 filas.
// Portado de out/index.html:
//   function headRow(mat){for(let i=0;i<Math.min(mat.length,6);i++){const rn=(mat[i]||[]).map(NA);if(rn.includes("ano")||rn.includes("anio")||rn.includes("year")||rn.includes("colaborador"))return i;}return 0;}
// ---------------------------------------------------------------------------
export function headRow(mat: Matrix): number {
  for (let i = 0; i < Math.min(mat.length, 6); i++) {
    const rn = (mat[i] || []).map(NA);
    if (rn.includes("ano") || rn.includes("anio") || rn.includes("year") || rn.includes("colaborador")) return i;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// monthKeyFrom — arma "YYYY-MM" desde año y mes. El mes puede venir como número
// o como nombre (se resuelve con MLONG por prefijo de 3 letras).
// Portado de out/index.html:
//   function monthKeyFrom(a,m){const y=parseInt(String(a==null?"":a).trim());let mo=parseInt(String(m==null?"":m).trim());
//     if(isNaN(mo)){const s=String(m||"").toLowerCase().slice(0,3);const i=MLONG.findIndex(x=>x.toLowerCase().startsWith(s));mo=i>=0?i+1:NaN;}
//     if(!y||isNaN(mo)||mo<1||mo>12)return null;return `${y}-${String(mo).padStart(2,"0")}`;}
// ---------------------------------------------------------------------------
export function monthKeyFrom(a: unknown, m: unknown): string | null {
  const y = parseInt(String(a == null ? "" : a).trim());
  let mo = parseInt(String(m == null ? "" : m).trim());
  if (isNaN(mo)) {
    const s = String(m || "").toLowerCase().slice(0, 3);
    const i = MLONG.findIndex((x) => x.toLowerCase().startsWith(s));
    mo = i >= 0 ? i + 1 : NaN;
  }
  if (!y || isNaN(mo) || mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// parseRows — mapea una matriz a objetos del `kind`.
// Portado de out/index.html:
//   function parseRows(kind,mat){const hr=headRow(mat);if(hr>0)mat=mat.slice(hr);const cols=COLMAP[kind];const head=mat[0].map(NA);
//    const ai=idxAnio(head),mmi=idxMes(head);const idx={};cols.forEach(c=>idx[c]=resolveIdx(head,c));
//    const out=[];for(let r=1;r<mat.length;r++){const row=mat[r];if(!row||row.every(x=>String(x).trim()===""))continue;
//      let key=CUR;if(ai>=0&&mmi>=0){const k=monthKeyFrom(row[ai],row[mmi]);if(k)key=k;}
//      const o={};cols.forEach(c=>{const j=idx[c];o[c]=j>=0&&row[j]!=null?normVal(c,row[j],kind):"";});
//      if(!cols.some(c=>c!=="pais"&&o[c]&&String(o[c]).trim()!==""))continue;
//      if(cols.includes("pais")){const cp=cargaPais();
//        if(typeof ROLE!=="undefined"&&ROLE!=="__all__")o.pais=ROLE;
//        else if(!o.pais)o.pais=cp;}
//      out.push({key,o});}
//    return out;}
//
// Aquí CUR → opts.mesActual, ROLE → opts.rolPais, cargaPais() → opts.paisCarga.
// Se devuelve el objeto completo { kind, rows, faltantes } (el index devolvía
// solo el array `out`; `rows` conserva esa forma).
// ---------------------------------------------------------------------------
export function parseRows(kind: ColmapKind, matIn: Matrix, opts: ParseOptions): ParseResult {
  const cols = COLMAP[kind];
  let mat = matIn;
  const hr = headRow(mat);
  if (hr > 0) mat = mat.slice(hr);

  // Sin filas / sin encabezado ⇒ nada que parsear; todos los requeridos faltan.
  if (!mat.length || !mat[0]) {
    return { kind, rows: [], faltantes: (REQUIRED_FIELDS[kind] || []).slice() };
  }

  const head = (mat[0] as unknown[]).map(NA);
  const ai = idxAnio(head);
  const mmi = idxMes(head);
  const idx: Record<string, number> = {};
  cols.forEach((c) => {
    idx[c] = resolveIdx(head, c);
  });

  // Reporte de campos requeridos sin columna reconocible (Req 9.6).
  const faltantes = (REQUIRED_FIELDS[kind] || []).filter((c) => (idx[c] == null ? resolveIdx(head, c) : idx[c]) < 0);

  const rolPais = opts.rolPais;
  const esPais = typeof rolPais !== "undefined" && rolPais !== "__all__";
  const paisCarga = opts.paisCarga || "";

  const out: ParsedRow[] = [];
  for (let r = 1; r < mat.length; r++) {
    const row = mat[r] as unknown[];
    if (!row || row.every((x) => String(x == null ? "" : x).trim() === "")) continue;

    let key = opts.mesActual;
    if (ai >= 0 && mmi >= 0) {
      const k = monthKeyFrom(row[ai], row[mmi]);
      if (k) key = k;
    }

    const o: Record<string, string> = {};
    cols.forEach((c) => {
      const j = idx[c];
      o[c] = j >= 0 && row[j] != null ? normVal(c, row[j], kind) : "";
    });

    // Fila vacía (ningún campo distinto de "pais" con valor) ⇒ se descarta.
    if (!cols.some((c) => c !== "pais" && o[c] && String(o[c]).trim() !== "")) continue;

    // Carga por país: un usuario de país fuerza su país; un global completa el
    // país de carga si la fila no lo trae.
    if (cols.includes("pais")) {
      if (esPais) o.pais = rolPais as string;
      else if (!o.pais) o.pais = paisCarga;
    }

    out.push({ key, o });
  }

  return { kind, rows: out, faltantes };
}

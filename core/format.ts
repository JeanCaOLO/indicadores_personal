// core/format.ts
//
// Helpers de formato de valores de KPI.
// Portados LÍNEA POR LÍNEA desde out/index.html (fuente de verdad):
//   function pct(v){return (v*100).toFixed(1);}
//   function fmt(v,t){return t==="pct"?pct(v):t==="int"?String(Math.round(v)):v.toFixed(1);}
//   function nfmt(n){return (Math.round(n)).toLocaleString("es-CR");}
//
// Paridad EXACTA: mismos toFixed, mismo redondeo y mismo locale "es-CR".
// No contiene lógica de UI.

import type { KpiType } from "./types";

/** Porcentaje: multiplica por 100 y deja 1 decimal. */
export function pct(v: number): string {
  return (v * 100).toFixed(1);
}

/**
 * Formatea un valor según el tipo de KPI.
 * - "pct": usa `pct` (×100, 1 decimal)
 * - "int": entero redondeado
 * - resto ("num", "days", ...): 1 decimal
 */
export function fmt(v: number, t: KpiType | string): string {
  return t === "pct" ? pct(v) : t === "int" ? String(Math.round(v)) : v.toFixed(1);
}

/** Número entero con separadores de miles en locale "es-CR". */
export function nfmt(n: number): string {
  return Math.round(n).toLocaleString("es-CR");
}

// ===========================================================================
// titleCase — normaliza capitalización de nombres propios / áreas / carreras.
// Portado LÍNEA POR LÍNEA desde out/index.html (fuente de verdad):
//   function titleCase(s){s=String(s==null?"":s).trim();if(!s)return "";
//     const low=new Set(["de","del","la","las","los","el","y","e","en","a","al","da","do"]);
//     return s.toLowerCase().split(/(\s+|\/|-)/).map((w,i)=>{if(w==="/"||w==="-"||w===""||/^\s+$/.test(w))return w;if(i>0&&low.has(w))return w;return w.charAt(0).toUpperCase()+w.slice(1);}).join("");}
//
// `compute()` lo usa para agrupar carreras (carreraC). Se porta aquí (helper de
// formato de strings) para que compute pueda importarlo sin duplicarlo.
// ===========================================================================
export function titleCase(s: unknown): string {
  let str = String(s == null ? "" : s).trim();
  if (!str) return "";
  const low = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "a", "al", "da", "do"]);
  return str
    .toLowerCase()
    .split(/(\s+|\/|-)/)
    .map((w, i) => {
      if (w === "/" || w === "-" || w === "" || /^\s+$/.test(w)) return w;
      if (i > 0 && low.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

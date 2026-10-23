import type { MonthKey } from "./types";

/**
 * Utilidades de fechas portadas línea por línea desde `out/index.html`
 * (fuente de verdad). Se preserva la aritmética EXACTA: la constante de
 * milisegundos por año `365.25 * 864e5`, los redondeos y el comportamiento
 * de borde (null para fechas inválidas).
 *
 * El único cambio respecto del original es eliminar el global `TODAY`:
 * `asofFor` recibe ahora `today` como parámetro explícito. Ninguna de estas
 * funciones introduce un `new Date()` implícito que no estuviera en el original.
 */

/**
 * Original: `function asofFor(k){const y=+k.slice(0,4),m=+k.slice(5,7);const monthEnd=new Date(y,m,0);return TODAY<monthEnd?TODAY:monthEnd;}`
 * El global `TODAY` se convierte en el parámetro explícito `today`.
 */
export function asofFor(k: MonthKey, today: Date): Date {
  const y = +k.slice(0, 4),
    m = +k.slice(5, 7);
  const monthEnd = new Date(y, m, 0);
  return today < monthEnd ? today : monthEnd;
}

/**
 * Original: `function yearsBetween(a,b){if(!a)return null;const d=new Date(a);if(isNaN(d))return null;return (b-d)/(365.25*864e5);}`
 * `b` es un Date; `a` es string|Date. Se conserva `365.25*864e5` EXACTO.
 */
export function yearsBetween(a: string | Date | null | undefined, b: Date): number | null {
  if (!a) return null;
  const d = new Date(a);
  if (isNaN(d.getTime())) return null;
  return (+b - +d) / (365.25 * 864e5);
}

/**
 * Original: `function bizDaysInMonth(k){const y=+k.slice(0,4),m=+k.slice(5,7);let c=0,d=new Date(y,m-1,1);while(d.getMonth()===m-1){const w=d.getDay();if(w>=1&&w<=5)c++;d.setDate(d.getDate()+1);}return c;}`
 */
export function bizDaysInMonth(k: MonthKey): number {
  const y = +k.slice(0, 4),
    m = +k.slice(5, 7);
  let c = 0,
    d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) {
    const w = d.getDay();
    if (w >= 1 && w <= 5) c++;
    d.setDate(d.getDate() + 1);
  }
  return c;
}

/**
 * Original: `function isBiz(d){const w=d.getDay();return w>=1&&w<=5;}`
 */
export function isBiz(d: Date): boolean {
  const w = d.getDay();
  return w >= 1 && w <= 5;
}

/**
 * Original: `function nthBizDay(y,m,n){let d=new Date(y,m,1),c=0;while(true){if(isBiz(d)){c++;if(c===n)return new Date(d);}d.setDate(d.getDate()+1);}}`
 */
export function nthBizDay(y: number, m: number, n: number): Date {
  let d = new Date(y, m, 1),
    c = 0;
  while (true) {
    if (isBiz(d)) {
      c++;
      if (c === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
}

/**
 * Original: `function lastDay(y,m){return new Date(y,m+1,0);}`
 */
export function lastDay(y: number, m: number): Date {
  return new Date(y, m + 1, 0);
}

/**
 * Original: `function addBiz(d,n){const r=new Date(d);let s=n<0?-1:1,left=Math.abs(n);while(left>0){r.setDate(r.getDate()+s);if(isBiz(r))left--;}return r;}`
 */
export function addBiz(d: Date, n: number): Date {
  const r = new Date(d);
  let s = n < 0 ? -1 : 1,
    left = Math.abs(n);
  while (left > 0) {
    r.setDate(r.getDate() + s);
    if (isBiz(r)) left--;
  }
  return r;
}

/**
 * Original: `function bizBetween(a,b){let c=0,d=new Date(a);const e=new Date(b);const s=a<=b?1:-1;while((s>0&&d<e)||(s<0&&d>e)){d.setDate(d.getDate()+s);if(isBiz(d))c+=s;}return c;}`
 */
export function bizBetween(a: Date, b: Date): number {
  let c = 0,
    d = new Date(a);
  const e = new Date(b);
  const s = a <= b ? 1 : -1;
  while ((s > 0 && d < e) || (s < 0 && d > e)) {
    d.setDate(d.getDate() + s);
    if (isBiz(d)) c += s;
  }
  return c;
}

/**
 * Original: `function fmtDate(d){return d.toLocaleDateString("es-CR",{day:"2-digit",month:"short",year:"numeric"});}`
 */
export function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

import type { MonthKey, ConfigDB } from "./types";

/**
 * Deserción de primer año y fecha/área del último accidente.
 *
 * Portado LÍNEA POR LÍNEA desde `out/index.html` (fuente de verdad). Se
 * preserva la aritmética EXACTA: la ventana de 12 meses
 * (`start = new Date(y, mo-12, 1)`, `end = new Date(y, mo, 0)`), el umbral de
 * antigüedad `0 <= t < 1` año con la constante `365.25 * 864e5`, el recorrido
 * de TODOS los meses del DB, el filtro por país y el salteo de `"__cfg"` y de
 * claves que no matcheen `/^\d{4}-\d{2}$/`.
 *
 * ELIMINACIÓN DE GLOBALES: los globales `DB` y `PAIS` del original se
 * convierten en parámetros explícitos (`db`, `pais`). Nada más cambia: la
 * aritmética, los límites de la ventana y el conteo quedan idénticos.
 *
 * ⚠️ COMPORTAMIENTO "RARO" PRESERVADO AL PIE DE LA LETRA (conteo de ingresos):
 * En `desercion12` el contador `ing` se incrementa en DOS recorridos distintos
 * y potencialmente cuenta la misma incorporación dos veces:
 *   1) Una vez por cada `activo` del mes consultado `k` cuya `fecha_ingreso`
 *      cae dentro de la ventana `[start, end]`.
 *   2) Otra vez por cada `egreso` de CUALQUIER mes del DB cuya `fecha_ingreso`
 *      (o `ingreso`) cae dentro de la ventana `[start, end]`.
 * Es decir, alguien que ingresó dentro de la ventana y además egresó dentro de
 * la ventana puede sumar a `ing` por ambas vías. El original hace exactamente
 * esto; NO se "arregla" para mantener paridad numérica con el sistema actual.
 */

/**
 * Original:
 * `function desercion12(k){const y=+k.slice(0,4),mo=+k.slice(5,7);const end=new Date(y,mo,0);const start=new Date(y,mo-12,1);let egr=0,ing=0;const fp=r=>PAIS==="__all__"||(r.pais||"")===PAIS;`
 * `  Object.keys(DB).forEach(mk=>{if(mk==="__cfg"||!/^\d{4}-\d{2}$/.test(mk))return;const mEnd=new Date(+mk.slice(0,4),+mk.slice(5,7),0);`
 * `    (DB[mk].egresos||[]).filter(fp).forEach(e=>{const ingr=e.fecha_ingreso||e.ingreso;if(!ingr)return;const salRaw=e.fecha_salida||e.salida;const sal=salRaw?new Date(salRaw):mEnd;if(sal<start||sal>end)return;const t=(sal-new Date(ingr))/(365.25*864e5);if(t>=0&&t<1)egr++;});});`
 * `  const rk=(DB[k]&&DB[k].activos||[]).filter(fp);`
 * `  rk.forEach(a=>{if(a.fecha_ingreso){const d=new Date(a.fecha_ingreso);if(d>=start&&d<=end)ing++;}});`
 * `  Object.keys(DB).forEach(mk=>{if(mk==="__cfg"||!/^\d{4}-\d{2}$/.test(mk))return;(DB[mk].egresos||[]).filter(fp).forEach(e=>{const ingr=e.fecha_ingreso||e.ingreso;if(ingr){const d=new Date(ingr);if(d>=start&&d<=end)ing++;}});});`
 * `  return {egr,ing};}`
 *
 * El global `DB` → `db`; el global `PAIS` → `pais`. El filtro `fp` usa `pais`.
 */
export function desercion12(
  k: MonthKey,
  db: ConfigDB,
  pais: string
): { egr: number; ing: number } {
  const y = +k.slice(0, 4),
    mo = +k.slice(5, 7);
  const end = new Date(y, mo, 0);
  const start = new Date(y, mo - 12, 1);
  let egr = 0,
    ing = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fp = (r: any) => pais === "__all__" || (r.pais || "") === pais;

  Object.keys(db).forEach((mk) => {
    if (mk === "__cfg" || !/^\d{4}-\d{2}$/.test(mk)) return;
    const mEnd = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((db[mk as MonthKey].egresos as any[]) || []).filter(fp).forEach((e: any) => {
      const ingr = e.fecha_ingreso || e.ingreso;
      if (!ingr) return;
      const salRaw = e.fecha_salida || e.salida;
      const sal = salRaw ? new Date(salRaw) : mEnd;
      if (sal < start || sal > end) return;
      const t = (+sal - +new Date(ingr)) / (365.25 * 864e5);
      if (t >= 0 && t < 1) egr++;
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rk = (((db[k] && db[k].activos) as any[]) || []).filter(fp);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rk.forEach((a: any) => {
    if (a.fecha_ingreso) {
      const d = new Date(a.fecha_ingreso);
      if (d >= start && d <= end) ing++;
    }
  });

  Object.keys(db).forEach((mk) => {
    if (mk === "__cfg" || !/^\d{4}-\d{2}$/.test(mk)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((db[mk as MonthKey].egresos as any[]) || []).filter(fp).forEach((e: any) => {
      const ingr = e.fecha_ingreso || e.ingreso;
      if (ingr) {
        const d = new Date(ingr);
        if (d >= start && d <= end) ing++;
      }
    });
  });

  return { egr, ing };
}

/**
 * Original:
 * `function lastAccidentDate(asof){let best=null;Object.keys(DB).forEach(mk=>{if(mk==="__cfg")return;const f=DB[mk]&&DB[mk].params&&DB[mk].params.fecha_ult_accidente;if(f){const d=new Date(f);if(!isNaN(d)&&d<=asof&&(!best||d>best))best=d;}});return best;}`
 *
 * El global `DB` → `db`. NOTA: el original recorre TODAS las claves de `DB`
 * salteando solo `"__cfg"` (no filtra por el patrón `/^\d{4}-\d{2}$/`); se
 * preserva ese comportamiento literal.
 */
export function lastAccidentDate(asof: Date, db: ConfigDB): Date | null {
  let best: Date | null = null;
  Object.keys(db).forEach((mk) => {
    if (mk === "__cfg") return;
    const f =
      db[mk as MonthKey] &&
      db[mk as MonthKey].params &&
      db[mk as MonthKey].params.fecha_ult_accidente;
    if (f) {
      const d = new Date(f);
      if (!isNaN(d.getTime()) && d <= asof && (!best || d > best)) best = d;
    }
  });
  return best;
}

/**
 * Original:
 * `function lastAccidentInfo(asof){let best=null,area="";Object.keys(DB).forEach(mk=>{if(mk==="__cfg")return;const pr=DB[mk]&&DB[mk].params;const f=pr&&pr.fecha_ult_accidente;if(f){const d=new Date(f);if(!isNaN(d)&&d<=asof&&(!best||d>best)){best=d;area=pr.accid_area||"";}}});return{date:best,area:area};}`
 *
 * El global `DB` → `db`. Devuelve además el área (`accid_area`) del último
 * accidente. Mismo recorrido y mismo criterio de "más reciente <= asof".
 */
export function lastAccidentInfo(
  asof: Date,
  db: ConfigDB
): { date: Date | null; area: string } {
  let best: Date | null = null,
    area = "";
  Object.keys(db).forEach((mk) => {
    if (mk === "__cfg") return;
    const pr = db[mk as MonthKey] && db[mk as MonthKey].params;
    const f = pr && pr.fecha_ult_accidente;
    if (f) {
      const d = new Date(f);
      if (!isNaN(d.getTime()) && d <= asof && (!best || d > best)) {
        best = d;
        area = (pr.accid_area as string) || "";
      }
    }
  });
  return { date: best, area: area };
}

// core/compute.ts
//
// NÚCLEO del motor de indicadores. Porta LÍNEA POR LÍNEA, desde la fuente de
// verdad `out/index.html` (solo lectura, no modificar):
//
//   function sum(a){return a.reduce((x,y)=>x+(+y||0),0);}
//   function safe(n,d){return d>0?n/d:0;}
//   function nivIdx(v){if(v==null)return -1;const m=String(v).match(/([1-5])/);return m?(+m[1]-1):-1;}
//   function M(k){...}          // normaliza el mes (crea arrays/params faltantes)
//   function hasData(k){...}
//   function rosterInfo(k){...}
//   function compute(k){...}    // el cálculo completo de KPIs/distribuciones
//   function kpiOn(k){...}
//   function meta(it){...}      // (ya portado en core/semaphore.ts)
//
// PARIDAD EXACTA: cada fórmula, ternario, redondeo y coerción `+x` se copia tal
// cual. Los tests de paridad (tarea 6.2) comparan contra el golden con
// tolerancia 1e-6; cualquier desviación rompe la paridad.
//
// ELIMINACIÓN DE GLOBALES → parámetros/ctx:
//   · DB                 → parámetro `db: ConfigDB`
//   · PAIS               → `ctx.pais`  (fp = r => ctx.pais==="__all__" || (r.pais||"")===ctx.pais)
//   · DEP                → `ctx.dep`
//   · AREA               → `ctx.area`  (compute no lo usa directamente, pero va en ctx)
//   · CUR                → el argumento `k: MonthKey`
//   · TODAY/ASOF         → `ctx.today`  (asofFor(k, ctx.today))
//   · +CUR.slice(0,4)    → `ctx.dashYear`  (año del dashboard para reconocimientos)
//   · DB.__cfg.satisfaccion → `db.__cfg.satisfaccion`
//   · VIEW/localStorage/save/load → NO van en el motor.
//
// `M(k)` del original MUTA `DB[k]` (crea el mes/arrays/params faltantes). Aquí,
// como función de LECTURA pura, `M(k, db)` devuelve una copia normalizada del
// mes (con la MISMA forma que el original deja) sin mutar `db` de forma
// observable para el llamador. `compute` solo lee de ese objeto.
//
// Helpers ya portados que se importan:
//   · core/dates.ts     → asofFor, yearsBetween, bizDaysInMonth
//   · core/desercion.ts → desercion12, lastAccidentDate
//   · core/kpi-defs.ts  → NIV
//   · core/format.ts    → titleCase
//   · core/semaphore.ts → meta  (re-exportado para la UI)

import { asofFor, yearsBetween, bizDaysInMonth } from "./dates";
import { desercion12, lastAccidentDate } from "./desercion";
import { NIV } from "./kpi-defs";
import { titleCase } from "./format";
import type {
  ComputeContext,
  ComputeResult,
  ConfigDB,
  MesData,
  MonthKey,
  ParametrosMes,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ===========================================================================
// Helpers puros (globales del index.html → funciones del motor)
// ===========================================================================

/** `function sum(a){return a.reduce((x,y)=>x+(+y||0),0);}` */
export function sum(a: any[]): number {
  return a.reduce((x: number, y: any) => x + (+y || 0), 0);
}

/** `function safe(n,d){return d>0?n/d:0;}` — denominador cero → 0. */
export function safe(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

/** `function nivIdx(v){if(v==null)return -1;const m=String(v).match(/([1-5])/);return m?(+m[1]-1):-1;}` */
export function nivIdx(v: any): number {
  if (v == null) return -1;
  const m = String(v).match(/([1-5])/);
  return m ? +m[1] - 1 : -1;
}

/** `function kpiOn(k){return !((DB.__cfg&&DB.__cfg.kpiOff)||[]).includes(k);}` → recibe `db`. */
export function kpiOn(k: string, db: ConfigDB): boolean {
  return !(((db.__cfg && db.__cfg.kpiOff) || []) as string[]).includes(k);
}

// ===========================================================================
// blankMonth — `function blankMonth(){return {...};}`
// Forma EXACTA del mes vacío del index.html (arrays + params por defecto).
// ===========================================================================
function blankMonth(): MesData {
  return {
    activos: [],
    egresos: [],
    ausencias: [],
    areas: [],
    capacitacion: [],
    extras: [],
    vacaciones: [],
    merma: [],
    terceros: [],
    params: {
      hc_indet: [0, 0, 0, 0, 0],
      hc_det: [0, 0, 0, 0, 0],
      suc_p45: [0, 0, 0, 0, 0],
      vac_dias: 0,
      vac_cant: 0,
      vac_fecha: "",
      of_realizadas: 0,
      of_rechazadas: 0,
      of_descartados: 0,
      of_contactados: 0,
      rot_ini: 0,
      rot_egr: 0,
      des_egr12: 0,
      des_ing12: 0,
      dias_habiles: 21,
      nuevos: 0,
      prom_colab: 0,
      colab_vac: 0,
      mant_cierre: 0,
      accidentes: 0,
      capacitados: 0,
      incidentes: 0,
      colab_accid: 0,
      mant_plan: 0,
      ot_dias: 0,
      encuesta: 0,
      fecha_ult_accidente: "",
      accid_area: "",
      ruta_basicas: 0,
      ruta_tecnicas: 0,
      ruta_liderazgo: 0,
    } as unknown as ParametrosMes,
  };
}

// ===========================================================================
// M — `function M(k){...}`
// En el index MUTA DB[k] creando el mes/arrays/params faltantes. Aquí, para una
// lectura pura, devolvemos una copia normalizada del mes existente (o un
// blankMonth) con la MISMA forma, SIN mutar `db` de forma observable.
// ===========================================================================
export function M(k: MonthKey, db: ConfigDB): MesData {
  // if(!DB[k])DB[k]=blankMonth();const m=DB[k];
  const existing = db[k];
  // Copia superficial de las colecciones + params, para no mutar db.
  const m: any = existing
    ? {
        activos: existing.activos,
        egresos: existing.egresos,
        ausencias: existing.ausencias,
        areas: existing.areas,
        capacitacion: existing.capacitacion,
        extras: existing.extras,
        vacaciones: existing.vacaciones,
        merma: existing.merma,
        terceros: existing.terceros,
        params: { ...(existing.params as any) },
      }
    : blankMonth();

  // if(!m.areas)m.areas=[]; ... (una por colección)
  if (!m.areas) m.areas = [];
  if (!m.capacitacion) m.capacitacion = [];
  if (!m.extras) m.extras = [];
  if (!m.vacaciones) m.vacaciones = [];
  if (!m.merma) m.merma = [];
  if (!m.terceros) m.terceros = [];
  // El index no reinicializa activos/egresos/ausencias aquí; se asume presentes.
  if (!m.activos) m.activos = [];
  if (!m.egresos) m.egresos = [];
  if (!m.ausencias) m.ausencias = [];
  if (!m.params) m.params = blankMonth().params;

  // ["mant_cierre",...,"horas_hombre"].forEach(f=>{if(m.params[f]==null)m.params[f]=0;});
  [
    "mant_cierre",
    "accidentes",
    "incidentes",
    "colab_accid",
    "mant_plan",
    "ot_dias",
    "encuesta",
    "ruta_basicas",
    "ruta_tecnicas",
    "ruta_liderazgo",
    "horas_hombre",
  ].forEach((f) => {
    if ((m.params as any)[f] == null) (m.params as any)[f] = 0;
  });
  // if(m.params.fecha_ult_accidente==null)m.params.fecha_ult_accidente="";
  if ((m.params as any).fecha_ult_accidente == null) (m.params as any).fecha_ult_accidente = "";
  return m as MesData;
}

// ===========================================================================
// hasData — `function hasData(k){...}`
//   const d=DB[k];if(!d)return false;return d.egresos.length||d.activos.length||...;
// Firma esperada por accumulate.ts: (k, db) => boolean.
// El original devuelve valores "truthy" numéricos; aquí se coacciona a boolean.
// ===========================================================================
export function hasData(k: MonthKey, db: ConfigDB): boolean {
  const d: any = db[k];
  if (!d) return false;
  return !!(
    d.egresos.length ||
    d.activos.length ||
    d.ausencias.length ||
    (d.areas && d.areas.length) ||
    (d.capacitacion && d.capacitacion.length) ||
    (d.extras && d.extras.length) ||
    (d.params && (d.params.prom_colab || d.params.hc_indet.some((x: any) => x)))
  );
}

// ===========================================================================
// rosterInfo — `function rosterInfo(k){...}`
// Devuelve el roster del mes, o arrastra el último mes <= k con activos.
// (compute NO usa rosterInfo para su cálculo —arma su propio _ri sin arrastre—
//  pero la UI sí lo usa, así que se porta con la misma firma.)
// ===========================================================================
export function rosterInfo(
  k: MonthKey,
  db: ConfigDB
): { rows: any[]; mk: string; carried: boolean } {
  const d = M(k, db);
  if (d && d.activos && d.activos.length) return { rows: d.activos, mk: k, carried: false };
  const keys = Object.keys(db)
    .filter((mk) => mk !== "__cfg" && db[mk as MonthKey] && (db[mk as MonthKey] as any).activos && (db[mk as MonthKey] as any).activos.length)
    .sort();
  if (!keys.length) return { rows: [], mk: k, carried: false };
  const le = keys.filter((mk) => mk <= k);
  const mk = le.length ? le[le.length - 1] : keys[0];
  return { rows: (db[mk as MonthKey] as any).activos, mk: mk, carried: true };
}

// ===========================================================================
// compute — `function compute(k){...}`  (el núcleo)
// Firma nueva: (k, db, ctx) => ComputeResult.
// ===========================================================================
export function compute(k: MonthKey, db: ConfigDB, ctx: ComputeContext): ComputeResult {
  const d = M(k, db),
    p: any = d.params;
  // fp=r=>PAIS==="__all__"||(r.pais||"")===PAIS;
  const fp = (r: any) => ctx.pais === "__all__" || (r.pais || "") === ctx.pais;
  // No se arrastra el roster de otros meses: si el mes no tiene su propio listado
  // de activos, el headcount y niveles salen de los parámetros cargados ESE mes.
  const _ri =
    d.activos && d.activos.length
      ? { rows: (d.activos as any[]).slice(), mk: k, carried: false }
      : { rows: [] as any[], mk: k, carried: false };
  const roster = _ri.rows.filter(fp),
    rosterN = roster.length,
    areaN = (d.areas || []).filter(fp).length;
  const paisC: any = {};
  _ri.rows.forEach((a: any) => {
    if (a.pais) {
      paisC[a.pais] = (paisC[a.pais] || 0) + 1;
    }
  });
  const hasNivel = roster.some((a: any) => nivIdx(a.nivel) >= 0);
  const hasPaso = roster.some((a: any) => a.paso !== "" && a.paso != null && !isNaN(parseInt(a.paso)));
  const hasTipo = roster.some((a: any) => a.tipo);
  let hcN = [0, 0, 0, 0, 0],
    indet = 0,
    det = 0,
    paso45 = 0;
  if (hasNivel) {
    roster.forEach((a: any) => {
      const i = nivIdx(a.nivel);
      if (i >= 0) hcN[i]++;
    });
  } else hcN = NIV.map((_, i) => (+p.hc_indet[i] || 0) + (+p.hc_det[i] || 0));
  if (hasTipo) {
    roster.forEach((a: any) => {
      String(a.tipo || "").toLowerCase().startsWith("det") ? det++ : indet++;
    });
  } else {
    indet = sum(p.hc_indet);
    det = sum(p.hc_det);
  }
  if (hasPaso) {
    roster.forEach((a: any) => {
      const ps = parseInt(a.paso);
      if ((ps === 4 || ps === 5) && a.movilidad === "M5") paso45++;
    });
  } else paso45 = sum(p.suc_p45);
  const hcNivTot = sum(hcN);
  const areaTot = areaN ? sum((d.areas || []).filter(fp).map((a: any) => +a.colaboradores || 0)) : 0;
  const hcTot = areaN ? areaTot : rosterN > 0 ? rosterN : sum(hcN);
  const prom = p.prom_colab > 0 ? +p.prom_colab : hcTot;
  const asof = asofFor(k, ctx.today);
  const ages: number[] = [],
    tens: number[] = [],
    sexoC: any = {},
    educC: any = {},
    carreraC: any = {},
    areaC: any = {},
    ageDep: any = {},
    depC: any = {},
    movimC: any = {},
    movMC: any = {},
    sexoByArea: any = {},
    sexoByDep: any = {},
    movMByDep: any = {},
    depAreaC: any = {},
    movimByDep: any = {};
  roster.forEach((a: any) => {
    const ag = yearsBetween(a.fecha_nacimiento, asof);
    if (ag != null && ag > 0 && ag < 90) {
      ages.push(ag);
      const dp = a.departamento || "—";
      (ageDep[dp] = ageDep[dp] || []).push(ag);
    }
    const tn = yearsBetween(a.fecha_ingreso, asof);
    if (tn != null && tn >= 0 && tn < 60) tens.push(tn);
    const dpx = a.departamento || "—";
    depC[dpx] = (depC[dpx] || 0) + 1;
    const ar = a.area || "—";
    areaC[ar] = (areaC[ar] || 0) + 1;
    (depAreaC[dpx] = depAreaC[dpx] || {})[ar] = ((depAreaC[dpx] || {})[ar] || 0) + 1;
    if (a.sexo) {
      sexoC[a.sexo] = (sexoC[a.sexo] || 0) + 1;
      (sexoByArea[ar] = sexoByArea[ar] || {})[a.sexo] = ((sexoByArea[ar] || {})[a.sexo] || 0) + 1;
      (sexoByDep[dpx] = sexoByDep[dpx] || {})[a.sexo] = ((sexoByDep[dpx] || {})[a.sexo] || 0) + 1;
    }
    if (a.nivel_educativo) educC[a.nivel_educativo] = (educC[a.nivel_educativo] || 0) + 1;
    if (a.carrera && String(a.carrera).trim()) {
      const cr = titleCase(String(a.carrera).trim());
      carreraC[cr] = (carreraC[cr] || 0) + 1;
    }
    if (a.movilidad) {
      movMC[a.movilidad] = (movMC[a.movilidad] || 0) + 1;
      (movMByDep[dpx] = movMByDep[dpx] || {})[a.movilidad] = ((movMByDep[dpx] || {})[a.movilidad] || 0) + 1;
    }
    if (a.movimiento) {
      movimC[a.movimiento] = (movimC[a.movimiento] || 0) + 1;
      (movimByDep[dpx] = movimByDep[dpx] || {})[a.movimiento] = ((movimByDep[dpx] || {})[a.movimiento] || 0) + 1;
    }
  });
  const avg = (arr: number[]) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0);
  const edadProm = avg(ages),
    antigProm = avg(tens);
  const promAsc = (movimC["Promoción"] || 0) + (movimC["Ascenso"] || 0);
  const ownRoster = (d.activos || []).filter(fp);
  const rosterOwnN = ownRoster.length;
  const movimOwn: any = {};
  ownRoster.forEach((a: any) => {
    if (a.movimiento) movimOwn[a.movimiento] = (movimOwn[a.movimiento] || 0) + 1;
  });
  // Si el campo "movimiento" viene como ESTADO histórico (aparece "Sin cambio" o
  // está lleno para todo el roster), NO se cuenta como promociones/ascensos del
  // mes: solo cuenta cuando es la acción registrada del período.
  const movimStatus =
    rosterOwnN > 0 &&
    (!!movimOwn["Sin cambio"] || (Object.values(movimOwn) as number[]).reduce((a, b) => a + b, 0) >= rosterOwnN);
  const edadByDep = Object.fromEntries(Object.entries(ageDep).map(([kk, v]) => [kk, avg(v as number[])]));
  const cap = (d.capacitacion || []).filter(fp),
    capHoras = sum(cap.map((c: any) => +c.horas || 0));
  const capByArea: any = {};
  cap.forEach((c: any) => {
    const a = c.area_conocimiento || "—";
    capByArea[a] = (capByArea[a] || 0) + (+c.horas || 0);
  });
  const extras = (d.extras || []).filter(fp),
    extrasByArea: any = {},
    extrasByDep: any = {},
    extrasByDepArea: any = {};
  extras.forEach((x: any) => {
    const a = x.area || "—";
    extrasByArea[a] = (extrasByArea[a] || 0) + (+x.horas || 0);
    const dp = x.departamento || "—";
    extrasByDep[dp] = (extrasByDep[dp] || 0) + (+x.horas || 0);
    (extrasByDepArea[dp] = extrasByDepArea[dp] || {})[a] = ((extrasByDepArea[dp] || {})[a] || 0) + (+x.horas || 0);
  });
  const mermaRows = (d.merma || []).filter(fp),
    mermaByArea: any = {};
  mermaRows.forEach((x: any) => {
    const a = x.area || "—";
    mermaByArea[a] = (mermaByArea[a] || 0) + (+x.cantidad || 0);
  });
  const mermaTot = sum(Object.values(mermaByArea));
  // Reconocimientos por antigüedad según el año del dashboard
  const dashYear = ctx.dashYear; // +CUR.slice(0,4)
  const MILE = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
  const recon: any[] = [];
  roster.forEach((a: any) => {
    const fi = String(a.fecha_ingreso || "").slice(0, 4);
    if (!/^\d{4}$/.test(fi)) return;
    const yrs = dashYear - +fi;
    if (MILE.indexOf(yrs) >= 0) recon.push({ yrs, nombre: a.nombre || "", departamento: a.departamento || "—" });
  });
  recon.sort((x, y) => y.yrs - x.yrs || x.nombre.localeCompare(y.nombre));
  const extrasTot = sum(extras.map((x: any) => +x.horas || 0));
  const vacs = (d.vacaciones || []).filter(fp);
  const vacDisfByArea: any = {},
    vacPendByArea: any = {},
    vacDisfByDepArea: any = {},
    vacPendByDepArea: any = {};
  vacs.forEach((x: any) => {
    const dp = x.departamento || "—";
    const ar = x.area || x.departamento || "—";
    const dd = +x.dias || 0;
    if (dd) {
      vacDisfByArea[ar] = (vacDisfByArea[ar] || 0) + dd;
      (vacDisfByDepArea[dp] = vacDisfByDepArea[dp] || {})[ar] = ((vacDisfByDepArea[dp] || {})[ar] || 0) + dd;
    }
  });
  roster.forEach((a: any) => {
    const dp = a.departamento || "—";
    const ar = a.area || "—";
    const dd = +a.vac_disfrutadas || 0,
      pp = +a.vac_pendientes || 0;
    if (dd && !vacs.length) {
      vacDisfByArea[ar] = (vacDisfByArea[ar] || 0) + dd;
      (vacDisfByDepArea[dp] = vacDisfByDepArea[dp] || {})[ar] = ((vacDisfByDepArea[dp] || {})[ar] || 0) + dd;
    }
    if (pp) {
      vacPendByArea[ar] = (vacPendByArea[ar] || 0) + pp;
      (vacPendByDepArea[dp] = vacPendByDepArea[dp] || {})[ar] = ((vacPendByDepArea[dp] || {})[ar] || 0) + pp;
    }
  });
  const vacPendTot = sum(Object.values(vacPendByArea)),
    vacDisfTot = sum(Object.values(vacDisfByArea));
  const egAll = (d.egresos || []).filter(fp),
    edep = (e: any) => e.departamento || e.dep || "—",
    eg = ctx.dep === "__all__" ? egAll : egAll.filter((e: any) => edep(e) === ctx.dep);
  const byMot: any = {},
    egByDep: any = {};
  egAll.forEach((e: any) => {
    egByDep[edep(e)] = (egByDep[edep(e)] || 0) + 1;
  });
  eg.forEach((e: any) => {
    byMot[e.motivo || "Otro"] = (byMot[e.motivo || "Otro"] || 0) + 1;
  });
  let ccss = 0,
    ins = 0,
    perm = 0,
    vacD = 0,
    otrosAus = 0;
  (d.ausencias || []).filter(fp).forEach((a: any) => {
    const t = String(a.tipo || ""),
      n = +a.dias || 0;
    if (t.includes("CCSS")) ccss += n;
    else if (t.includes("INS")) ins += n;
    else if (/Vacac/i.test(t)) vacD += n;
    else if (/Permiso/i.test(t)) perm += n;
    else otrosAus += n;
  });
  const inc = ccss + ins + perm + otrosAus; // Ausentismo = incapacidades + permisos; excluye solo vacaciones
  const ausByTipo: any = {};
  (d.ausencias || []).filter(fp).forEach((a: any) => {
    const t = a.tipo || "—";
    ausByTipo[t] = (ausByTipo[t] || 0) + (+a.dias || 0);
  });
  const isIncap = (t: string) => /ccss|ins|matern|patern|incapacidad/i.test(t);
  const incapTipo = Object.entries(ausByTipo).filter(([t]) => isIncap(t));
  const permTipo = Object.entries(ausByTipo).filter(([t]) => !isIncap(t));
  // Derivaciones automáticas desde activos + egresos (si no hay dato manual)
  const M47 = ["M4", "M5", "M7 NN"];
  const diasHab = +p.dias_habiles > 0 ? +p.dias_habiles : bizDaysInMonth(k);
  const nuevosDer = roster.filter((a: any) => String(a.fecha_ingreso || "").slice(0, 7) === k).length;
  const nuevosV = +p.nuevos > 0 ? +p.nuevos : nuevosDer;
  const rotIniDer = M47.reduce((s, m) => s + (movMC[m] || 0), 0);
  const rotIniV = rosterN ? rotIniDer : +p.rot_ini || 0;
  const rotEgrDer = egAll.filter((e: any) => M47.includes(e.movilidad || e.mov)).length;
  const rotEgrV = rosterN || egAll.length ? rotEgrDer : +p.rot_egr || 0;
  const der12 = desercion12(k, db, ctx.pais);
  const desIngV = +p.des_ing12 > 0 ? +p.des_ing12 : der12.ing;
  const desEgrV = +p.des_egr12 > 0 ? +p.des_egr12 : der12.egr;
  const diasLab = hcTot * diasHab;
  const lastAcc = lastAccidentDate(asof, db);
  const diasSinAcc = lastAcc ? Math.max(0, Math.round((+asof - +lastAcc) / 864e5)) : null;
  const vacFecha = p.vac_fecha || "";
  const vacActiva = vacFecha ? Math.max(0, Math.round((+asof - +new Date(vacFecha)) / 864e5)) : 0;
  return {
    hcN,
    hcNivTot,
    hcTot,
    indet,
    det,
    paso45,
    prom,
    rosterN,
    areaN,
    areas: (d.areas || []).filter(fp),
    paisC,
    egN: eg.length,
    egAllN: egAll.length,
    byMot,
    egByDep,
    ccss,
    ins,
    perm,
    vacD,
    inc,
    diasLab,
    edadProm,
    antigProm,
    sexoC,
    educC,
    carreraC,
    movMC,
    movimC,
    areaC,
    edadByDep,
    depC,
    promAsc,
    depAreaC,
    movimByDep,
    extrasByDepArea,
    vacDisfByDepArea,
    vacPendByDepArea,
    agesN: ages.length,
    sexoByArea,
    sexoByDep,
    movMByDep,
    extrasByArea,
    extrasByDep,
    extrasTot,
    mermaByArea,
    mermaTot,
    recon,
    dashYear,
    vacDisfByArea,
    vacPendByArea,
    ausByTipo,
    incapTipo,
    permTipo,
    vacFecha,
    rosterMonth: _ri.mk,
    rosterCarried: _ri.carried,
    rosterOwnN,
    movimOwn,
    movimStatus,
    capHoras,
    capByArea,
    cursos: cap,
    diasSinAcc,
    raw: {
      rot_indeseada: [rotEgrV, rotIniV],
      dias_vacante: [+p.vac_dias || 0, +p.vac_cant || 0],
      desercion: [desEgrV, desIngV],
      descarte: [+p.of_descartados || 0, +p.of_contactados || 0],
      efectividad: [+p.of_rechazadas || 0, +p.of_realizadas || 0],
      rot_total: [egAll.length, prom],
      rot_renuncia: [egAll.filter((e: any) => e.motivo === "Renuncia").length, prom],
      rot_despido: [egAll.filter((e: any) => e.motivo === "Despido").length, prom],
      nuevos: [nuevosV, prom],
      ausentismo: [inc, diasLab],
      vac_cobertura: [vacDisfTot, vacPendTot],
      cap_horas: [capHoras, 1],
      cap_cursos: [cap.length, 1],
      accidentes: [+p.accidentes || 0, 1],
      incidentes: [+p.incidentes || 0, 1],
    } as Record<string, [number, number]>,
    ind: {
      rot_indeseada: safe(rotEgrV, rotIniV),
      sucesion: safe(paso45, hcTot),
      dias_vacante: safe(+p.vac_dias, +p.vac_cant),
      desercion: safe(desEgrV, desIngV),
      descarte: safe(+p.of_descartados, +p.of_contactados),
      efectividad: safe(+p.of_rechazadas, +p.of_realizadas),
      rot_total: safe(egAll.length, prom),
      rot_renuncia: safe(egAll.filter((e: any) => e.motivo === "Renuncia").length, prom),
      rot_despido: safe(egAll.filter((e: any) => e.motivo === "Despido").length, prom),
      nuevos: safe(nuevosV, prom),
      ausentismo: safe(inc, diasLab),
      vac_cobertura: safe(vacDisfTot, vacPendTot),
      vacante_activa: vacActiva,
      encuesta:
        +p.encuesta ||
        (db.__cfg && db.__cfg.satisfaccion && +db.__cfg.satisfaccion[k.slice(0, 4)]) ||
        0,
      merma_hurto: mermaTot > 0 ? mermaTot : +p.merma_hurto || 0,
      accidentes: +p.accidentes || 0,
      accid_pct: safe(+p.colab_accid, prom),
      colab_accid_n: +p.colab_accid || 0,
      incidentes: +p.incidentes || 0,
      dias_sin_acc: diasSinAcc == null ? 0 : diasSinAcc,
      record_dias: +p.record_dias || 0,
      mant_plan: +p.mant_plan || 0,
      mant: +p.mant_cierre || 0,
      ot_dias: +p.ot_dias || 0,
      mant_prev: (+p.mant_prev || 0) > 1 ? (+p.mant_prev || 0) / 100 : +p.mant_prev || 0,
      cap_horas: capHoras,
      cap_hxc: safe(capHoras, hcTot || +p.prom_colab || 0),
      cap_cursos: cap.length,
      edad_prom: edadProm,
      antig_prom: antigProm,
      promo_asc: movimStatus ? null : safe((movimOwn["Promoción"] || 0) + (movimOwn["Ascenso"] || 0), rosterOwnN),
      promo: movimStatus ? null : safe(movimOwn["Promoción"] || 0, rosterOwnN),
      ascenso: movimStatus ? null : safe(movimOwn["Ascenso"] || 0, rosterOwnN),
    } as Record<string, number | null>,
  } as ComputeResult;
}

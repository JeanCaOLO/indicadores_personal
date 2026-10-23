// core/kpi-defs.ts
//
// Definiciones de los KPIs y grupos del dominio, portadas 1:1 desde la fuente
// de verdad `out/index.html`. NO se alteran valores, textos, números, tipos ni
// flags: paridad exacta con el sistema monolítico actual.
//
// Fuente de verdad (solo lectura, no modificar):
//   out/index.html →
//     - const KPI = [ ... ]            (array de 7 grupos con sus items)
//     - const KMAP = {}; KPI.forEach…   (mapa clave → item)
//     - const ACC_RATIO = [ ... ]       (claves acumulables por razón de sumas)
//     - const ACC_SUM   = [ ... ]       (claves acumulables por suma)
//     - const SRC = { ... }             (lógica de cálculo declarada por KPI)
//     - const NIV = ["N1".."N5"]        (niveles)
//     - const MSHORT / const MLONG       (nombres de meses)
//     - function monthsOf(y) / let MONTHS=monthsOf(YEAR)
//     - const mi = k => (+k.slice(5,7))-1
//     -     yOf = k => +k.slice(0,4)
//     - const PAISES = [ ... ]          (países del dominio)
//
// Los tipos vienen de ./types (KPI, Grupo, KpiType, MonthKey).

import type { Grupo, KPI as KpiDef, MonthKey } from "./types";

// ===========================================================================
// Grupos y definiciones de KPIs (const KPI en out/index.html)
// Copiado TAL CUAL: mismas claves, nombres, unidades, tipos, dirección `lower`,
// flags `info`/`esl` y umbrales `t:[a,b]`.
// ===========================================================================
export const KPI: Grupo[] = [
  {
    g: "Rotación",
    area: "Personal",
    sub: "Personal",
    items: [
      { k: "rot_total", name: "Rotación total del mes", unit: "%", type: "pct", lower: true, t: [0.03, 0.06], def: "Egresos del mes ÷ promedio de colaboradores" },
      { k: "rot_renuncia", name: "Rotación por renuncia", unit: "%", type: "pct", lower: true, t: [0.02, 0.04], def: "Renuncias del mes ÷ promedio de colaboradores" },
      { k: "rot_despido", name: "Rotación por despido", unit: "%", type: "pct", lower: true, t: [0.02, 0.04], def: "Despidos del mes ÷ promedio de colaboradores" },
      { k: "rot_indeseada", name: "Rotación indeseada", unit: "%", type: "pct", lower: true, t: [0.05, 0.1], def: "Egresados con movilidad M4, M5 y M7 NN ÷ cantidad de colaboradores M4, M5 y M7 NN" },
    ],
  },
  {
    g: "Reclutamiento y Selección",
    area: "Personal",
    sub: "Personal",
    items: [
      { k: "dias_vacante", name: "Días con posición desocupada", unit: "días", type: "days", lower: true, t: [15, 30], def: "Σ días de vacante ÷ nº de vacantes" },
      { k: "nuevos", name: "Nuevos colaboradores", unit: "%", type: "pct", lower: false, t: [0.01, 0.03], def: "Ingresos del mes ÷ promedio de colaboradores" },
      { k: "desercion", name: "Deserción 1er año", unit: "%", type: "pct", lower: true, t: [0.15, 0.25], def: "Egresos <1 año ÷ ingresos (12 meses)" },
      { k: "descarte", name: "Descarte por aspiración salarial", unit: "%", type: "pct", lower: true, t: [0.15, 0.3], def: "Oferentes descartados ÷ contactados" },
      { k: "efectividad", name: "Rechazo de oferta salarial", unit: "%", type: "pct", lower: true, t: [0.1, 0.25], def: "Ofertas rechazadas ÷ realizadas" },
    ],
  },
  {
    g: "Ausentismo y bienestar",
    area: "Personal",
    sub: "Personal",
    items: [
      { k: "ausentismo", name: "Ausentismo", unit: "%", type: "pct", lower: true, t: [0.02, 0.04], def: "Días de incapacidad (CCSS, INS, maternidad, paternidad) + permisos con/sin goce ÷ días laborales" },
      { k: "vac_cobertura", name: "Cobertura de vacaciones", unit: "%", type: "pct", lower: false, t: [0.3, 0.5], def: "Días de vacaciones disfrutados ÷ días de vacaciones acumulados" },
      { k: "encuesta", name: "Satisfacción laboral (anual)", unit: "", type: "num", esl: true, lower: false, t: [4.02, 4.29], def: "Resultado de la Encuesta Anual de Satisfacción — escala ESL (0–5)" },
    ],
  },
  {
    g: "Capacitación",
    area: "Personal",
    sub: "Personal",
    items: [
      { k: "cap_horas", name: "Horas de capacitación", unit: "h", type: "int", info: true, def: "Total de horas impartidas en el mes" },
      { k: "cap_hxc", name: "Horas por colaborador", unit: "h", type: "num", info: true, def: "Horas totales ÷ colaboradores" },
      { k: "cap_cursos", name: "Actividades / cursos", unit: "", type: "int", info: true, def: "Número de cursos impartidos" },
    ],
  },
  {
    g: "Desarrollo",
    area: "Personal",
    sub: "Personal",
    items: [
      { k: "promo", name: "Promociones", unit: "%", type: "pct", lower: false, t: [0.03, 0.1], def: "Colaboradores con movimiento = Promoción ÷ total" },
      { k: "ascenso", name: "Ascensos", unit: "%", type: "pct", lower: false, t: [0.03, 0.1], def: "Colaboradores con movimiento = Ascenso ÷ total" },
      { k: "sucesion", name: "Sucesión (paso 4·5 · M5)", unit: "%", type: "pct", lower: false, t: [0.05, 0.1], def: "Colaboradores en paso 4 o 5 que además son M5 ÷ plantilla" },
    ],
  },
  {
    g: "Seguridad y Salud Laboral",
    area: "Seguridad y Salud Laboral",
    sub: "SSL",
    items: [
      { k: "dias_sin_acc", name: "Días sin accidentes", unit: "días", type: "int", lower: false, t: [30, 90], def: "Días transcurridos desde el último accidente laboral" },
      { k: "record_dias", name: "Récord de días sin accidentes", unit: "días", type: "int", lower: false, info: true, def: "Mayor cantidad de días consecutivos sin accidentes laborales alcanzada (récord histórico)" },
      { k: "accidentes", name: "Accidentes laborales", unit: "", type: "int", lower: true, t: [1, 3], def: "Total de accidentes del mes" },
      { k: "colab_accid_n", name: "Colaboradores con accidentes", unit: "", type: "int", lower: true, info: true, def: "Cantidad de colaboradores que sufrieron accidentes en el mes (personas)" },
      { k: "merma_hurto", name: "Merma", unit: "", type: "int", lower: true, info: true, def: "Merma registrada en el mes (hurtos reportados)" },
    ],
  },
  {
    g: "Servicios Generales",
    area: "Servicios Generales",
    sub: "Mantenimiento",
    items: [
      { k: "mant_plan", name: "OT Período", unit: "", type: "int", lower: false, info: true, t: [0, 0], def: "Órdenes de trabajo del período (cantidad)" },
      { k: "mant", name: "Órdenes de trabajo cerradas", unit: "%", type: "pct", lower: false, t: [0.8, 0.9], def: "OT cerradas ÷ OT generadas" },
      { k: "ot_dias", name: "Días promedio para el cierre de OT", unit: "días", type: "days", lower: true, t: [3, 7], def: "Promedio de días entre apertura y cierre de la OT" },
      { k: "mant_prev", name: "Mantenimiento preventivo", unit: "%", type: "pct", lower: false, info: true, def: "% de mantenimiento preventivo (dato cargado del mes)" },
    ],
  },
];

// ===========================================================================
// Mapa clave → item (const KMAP en out/index.html)
//   const KMAP={};KPI.forEach(g=>g.items.forEach(it=>KMAP[it.k]=it));
// ===========================================================================
export const KMAP: Record<string, KpiDef> = {};
KPI.forEach((g) => g.items.forEach((it) => (KMAP[it.k] = it)));

// ===========================================================================
// Claves acumulables (const ACC_RATIO / const ACC_SUM en out/index.html)
//   ACC_RATIO → el acumulado suma [num,den] por separado y aplica safe(num,den)
//   ACC_SUM   → el acumulado suma solo numeradores
// ===========================================================================
export const ACC_RATIO: string[] = [
  "rot_indeseada",
  "dias_vacante",
  "desercion",
  "descarte",
  "efectividad",
  "rot_total",
  "nuevos",
  "ausentismo",
  "vac_cobertura",
];

export const ACC_SUM: string[] = ["cap_horas", "cap_cursos", "accidentes"];

// ===========================================================================
// Lógica de cálculo declarada por KPI (const SRC en out/index.html)
// Mapa clave → descripción de la fuente/definición de cálculo. Copiado tal cual.
// ===========================================================================
export const SRC: Record<string, string> = {
  rot_total: "Lista de Egresos (conteo) ÷ Promedio de colaboradores",
  rot_renuncia: "Egresos con motivo Renuncia ÷ Promedio de colaboradores",
  rot_despido: "Egresos con motivo Despido ÷ Promedio de colaboradores",
  rot_indeseada: "Egresados con movilidad M4, M5 y M7 NN ÷ cantidad de colaboradores M4, M5 y M7 NN · auto desde las listas",
  dias_vacante: "Σ días de vacante ÷ Nº de vacantes (Selección)",
  vacante_activa: "Días entre la fecha de apertura de la vacante y hoy (Selección)",
  nuevos: "Colaboradores de la lista con fecha de ingreso en el mes (auto) o dato manual ÷ promedio",
  desercion: "Egresos con antigüedad <1 año ÷ ingresos, 12 meses (auto desde las listas)",
  sucesion: "Colaboradores en paso 4 o 5 con movilidad M5 ÷ plantilla (activos; respaldo manual si no hay lista)",
  descarte: "Oferentes descartados ÷ contactados (Selección)",
  efectividad: "Ofertas rechazadas ÷ ofertas realizadas (Selección)",
  ausentismo: "Días de incapacidad (CCSS, INS, maternidad, paternidad) + permisos con o sin goce ÷ (colaboradores × días hábiles); excluye vacaciones",
  vac_cobertura: "Total días disfrutados (pestaña Vacaciones) ÷ Total días de vacaciones acumulados",
  encuesta: "Resultado de la Encuesta Anual de Satisfacción · escala ESL 0–5 (Selección)",
  cap_horas: "Suma de horas de la lista de Capacitación",
  cap_hxc: "Horas de capacitación ÷ colaboradores",
  cap_cursos: "Nº de actividades en la lista de Capacitación",
  promo_asc: "Lista de activos, campo movimiento (Promoción/Ascenso) ÷ total",
  promo: "Lista de activos, campo movimiento = Promoción ÷ total",
  ascenso: "Lista de activos, campo movimiento = Ascenso ÷ total",
  edad_prom: "Lista de activos, fecha de nacimiento (promedio)",
  antig_prom: "Lista de activos, fecha de ingreso (promedio)",
  dias_sin_acc: "Días transcurridos desde la fecha del último accidente (SSL)",
  accidentes: "Accidentes del mes (SSL)",
  accid_pct: "Colaboradores accidentados ÷ Promedio de colaboradores (SSL)",
  merma_hurto: "Merma del mes · hurtos reportados (SSL)",
  mant_plan: "Órdenes de trabajo del período (Servicios Generales, cantidad)",
  mant: "OT cerradas ÷ OT generadas (Servicios Generales, %)",
  ot_dias: "Días promedio para el cierre de OT (Servicios Generales)",
};

// ===========================================================================
// Niveles (const NIV en out/index.html)
// ===========================================================================
export const NIV: readonly string[] = ["N1", "N2", "N3", "N4", "N5"];

// ===========================================================================
// Nombres de meses (const MSHORT / const MLONG en out/index.html)
// ===========================================================================
export const MSHORT: readonly string[] = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const MLONG: readonly string[] = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ===========================================================================
// Países del dominio (const PAISES en out/index.html)
// Se porta aquí como constante común del dominio para importarla donde haga falta.
// ===========================================================================
export const PAISES: readonly string[] = ["Venezuela", "Costa Rica", "El Salvador", "Guatemala", "Colombia"];

// ===========================================================================
// Helpers de meses (función monthsOf / MONTHS / mi / yOf en out/index.html)
//   function monthsOf(y){return Array.from({length:12},(_,i)=>`${y}-${String(i+1).padStart(2,"0")}`);}
//   const mi=k=>(+k.slice(5,7))-1, yOf=k=>+k.slice(0,4)
// ===========================================================================

/** Devuelve las 12 claves "YYYY-MM" de un año. */
export function monthsOf(y: number): MonthKey[] {
  return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}` as MonthKey);
}

/** Índice del mes (0–11) a partir de una clave "YYYY-MM". */
export const mi = (k: string): number => +k.slice(5, 7) - 1;

/** Año (number) a partir de una clave "YYYY-MM". */
export const yOf = (k: string): number => +k.slice(0, 4);

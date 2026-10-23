// scripts/gen-golden.mjs
//
// Generador del "golden" de KPIs del SISTEMA ACTUAL (out/index.html).
//
// Qué hace
// --------
// Ejecuta el MOTOR REAL de cálculo embebido en `out/index.html` dentro de Node
// (sin navegador) y vuelca, para cada mes con datos y cada país
// (`__all__`, `Costa Rica`, `Venezuela`), los valores de los 29 KPIs:
//   - compute(k).ind   -> indicadores mensuales (snapshot)
//   - compute(k).raw   -> pares [num, den] usados por el acumulado
//   - accValue(itk, k) -> valor acumulado (YTD) por KPI
//   - derivados: hcTot, prom, edadProm, antigProm, diasSinAcc
// El resultado se guarda en test/fixtures/expected-kpis.json y sirve como vara
// de validación de paridad numérica del motor portado (tareas 4 y 6).
//
// Enfoque (Plan B del enunciado, el más fiel)
// -------------------------------------------
// 1. Se lee out/index.html como texto (NUNCA se modifica el archivo).
// 2. Se extrae el bloque <script> inline.
// 3. Se RECORTA el source desde el inicio hasta justo antes de la primera
//    función de UI/arranque (`function renderFilters`), quedándonos solo con el
//    motor puro + helpers de formato/semáforo. Así evitamos el código de DOM,
//    login, OLOAuth/OLOSync y los render* que arrancan la app al cargar.
// 4. Como `compute()` usa `titleCase()` (definida más abajo, en la zona de
//    import/export), se EXTRAE esa función por regex y se añade al recorte.
// 5. El motor usa `const TODAY=new Date();`. Para fijar la fecha de referencia,
//    se reemplaza SOLO en la copia en memoria del source por una fecha fija
//    documentada (TODAY_ISO). El archivo original queda intacto.
// 6. El recorte se evalúa en un sandbox `node:vm` con stubs mínimos de DOM
//    (document, window, localStorage no-ops) y se expone el motor vía una
//    función envoltorio que devuelve referencias a DB/compute/accValue/... .
// 7. Para cada (mes, país) se setean las globales del motor
//    (DB, PAIS, DEP, AREA, CUR, VIEW, YEAR, MONTHS) replicando lo que hace la
//    app al cambiar de filtro, y se invoca compute()/accValue().
//
// Uso
// ---
//   node scripts/gen-golden.mjs
// (desde la carpeta indicadores-app/, con Node 24. No usa red ni Supabase.)

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// ---- Fecha de referencia fija (se reutiliza como ctx.today en la tarea 6) ----
// Elegida constante y documentada. Posterior a todos los meses reales (hasta
// 2027-09) para que los cálculos "as-of" (días sin accidente, edad, antigüedad)
// usen el fin de mes y no la fecha actual del reloj.
const TODAY_ISO = "2026-10-06T00:00:00.000Z";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");

const INDEX_HTML = path.join(REPO_ROOT, "out", "index.html");
const SNAPSHOT = path.join(APP_ROOT, "test", "fixtures", "db.snapshot.json");
const OUT_JSON = path.join(APP_ROOT, "test", "fixtures", "expected-kpis.json");

const PAISES = ["__all__", "Costa Rica", "Venezuela"];

// --- 1 & 2: leer index.html y extraer el <script> inline del motor ---
const html = fs.readFileSync(INDEX_HTML, "utf8");

// El motor vive en el <script> que empieza con "use strict"; (el primero sin src).
const scriptBlocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const engineBlock = scriptBlocks.find((s) => s.includes('"use strict"') && s.includes("function compute("));
if (!engineBlock) throw new Error("No se encontró el bloque <script> del motor en out/index.html");

// --- 3: recortar hasta justo antes de la primera función de UI/arranque ---
const uiStart = engineBlock.indexOf("function renderFilters");
if (uiStart < 0) throw new Error("No se encontró el límite de UI (renderFilters)");
let engineSrc = engineBlock.slice(0, uiStart);

// --- 4: extraer titleCase() real (usada por compute) y añadirla al recorte ---
const tcMatch = engineBlock.match(/function titleCase\(s\)\{[\s\S]*?\.join\(""\);\}/) ||
  html.match(/function titleCase\(s\)\{[\s\S]*?\.join\(""\);\}/);
if (!tcMatch) throw new Error("No se encontró function titleCase");
const titleCaseSrc = tcMatch[0];

// --- 5: fijar TODAY en la copia en memoria (el archivo original NO se toca) ---
const beforeToday = engineSrc;
engineSrc = engineSrc.replace(
  /const TODAY=new Date\(\);/,
  `const TODAY=new Date(${JSON.stringify(TODAY_ISO)});`
);
if (engineSrc === beforeToday) throw new Error("No se pudo fijar TODAY en el source del motor");

// Envolver el recorte en una función que exponga las referencias que necesitamos.
// (Las funciones/const quedan en el scope de la función; las exportamos por nombre.)
const wrapped = `
"use strict";
${engineSrc}
${titleCaseSrc}
globalThis.__engine = {
  get DB(){return DB}, set DB(v){DB=v},
  set PAIS(v){PAIS=v}, set DEP(v){DEP=v}, set AREA(v){AREA=v},
  set CUR(v){CUR=v}, set VIEW(v){VIEW=v}, set YEAR(v){YEAR=v},
  set MONTHS(v){MONTHS=v},
  monthsOf, mi, compute, accValue, hasData, KPI, KMAP,
  TODAY,
};
`;

// --- 6: sandbox con stubs mínimos de DOM ---
const noop = () => {};
const stubEl = new Proxy(
  { style: {}, innerHTML: "", value: "", onchange: null, appendChild: noop, addEventListener: noop, setAttribute: noop, click: noop },
  { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => ((t[p] = v), true) }
);
const documentStub = {
  getElementById: () => stubEl,
  querySelector: () => stubEl,
  querySelectorAll: () => [],
  createElement: () => stubEl,
  addEventListener: noop,
  body: stubEl,
  head: stubEl,
};
const localStorageStub = { getItem: () => null, setItem: noop, removeItem: noop };
const sandbox = {
  console,
  document: documentStub,
  window: {},
  localStorage: localStorageStub,
  navigator: { language: "es-CR" },
  location: { href: "", search: "" },
  setTimeout: noop,
  setInterval: noop,
  URL: { createObjectURL: () => "" },
  Blob: function () {},
  globalThis: undefined, // se completa abajo
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(wrapped, sandbox, { filename: "engine-extracted.js" });

const E = sandbox.__engine;

// Chequeo rápido: la fecha fija quedó aplicada.
if (E.TODAY.toISOString() !== TODAY_ISO) {
  throw new Error(`TODAY fijado mal: ${E.TODAY.toISOString()} != ${TODAY_ISO}`);
}

// --- cargar el snapshot como DB del motor ---
const DB = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
E.DB = DB;

// Claves KPI del array del sistema (orden de presentación).
const KPI_KEYS = [];
E.KPI.forEach((g) => g.items.forEach((it) => KPI_KEYS.push(it.k)));

// Conjunto COMPLETO de indicadores que produce compute(...).ind.
// Los 29 KPIs del requisito incluyen, además de las 27 claves del array KPI,
// los derivados que el motor calcula en `ind` pero muestra en franjas/tooltips
// (p.ej. vacante_activa, accid_pct, incidentes, promo_asc). Para no perder
// ningún valor validable, el golden vuelca TODO `ind` y TODO `raw` de forma
// dinámica, descubriendo las claves desde el propio motor.
function engineIndKeys() {
  selectContext("2026-07", "__all__");
  E.VIEW = "mes";
  const c = E.compute("2026-07");
  return { indKeys: Object.keys(c.ind), rawKeys: Object.keys(c.raw) };
}

// --- meses reales con datos ---
// Filtramos a los meses de años razonables (< 2028): son los ~11 meses reales.
// Los ~170 "meses basura" (años 2028–2198, 1 registro cada uno) se excluyen por
// eficiencia; el enunciado aclara que incluirlos no cambia el golden y la tarea
// 8.1 (limpiarMesesVacios) los descarta de todos modos.
const REAL_YEAR_MAX = 2027;
const allMonths = Object.keys(DB)
  .filter((k) => /^\d{4}-\d{2}$/.test(k) && +k.slice(0, 4) <= REAL_YEAR_MAX)
  .sort();

// Setea las globales del motor replicando el cambio de filtro de la app.
function selectContext(mes, pais) {
  E.YEAR = +mes.slice(0, 4);
  E.MONTHS = E.monthsOf(+mes.slice(0, 4));
  E.CUR = mes;
  E.DEP = "__all__";
  E.AREA = "__all__";
  E.PAIS = pais;
}

function round(v) {
  if (v == null || typeof v !== "number" || !isFinite(v)) return v;
  // Evitar -0 y ruido binario extremo en el JSON; mantiene paridad a 1e-6.
  return Object.is(v, -0) ? 0 : v;
}

// mensual: usamos VIEW="mes" para compute; accValue se calcula aparte (acumulado).
const byMonthPais = {};
let cellsWithData = 0;

for (const mes of allMonths) {
  // hasData depende de PAIS? No: hasData(k) mira el mes completo (sin filtro de país).
  // Lo evaluamos una vez por mes para decidir si incluirlo.
  selectContext(mes, "__all__");
  E.VIEW = "mes";
  if (!E.hasData(mes)) continue;

  const perPais = {};
  for (const pais of PAISES) {
    selectContext(mes, pais);
    E.VIEW = "mes";
    const c = E.compute(mes);

    const ind = {};
    const raw = {};
    const acc = {};
    // Volcado COMPLETO de ind: todas las claves que produce el motor.
    for (const k of Object.keys(c.ind)) {
      ind[k] = round(c.ind[k]);
    }
    // Volcado COMPLETO de raw: pares [num, den] (algunos pueden faltar).
    for (const k of Object.keys(c.raw)) {
      const r = c.raw[k];
      raw[k] = Array.isArray(r) ? [round(r[0]), round(r[1])] : round(r);
    }
    // Acumulado (YTD): accValue sirve para cualquier clave de ind
    // (ACC_RATIO / ACC_SUM / snapshot). Depende de MONTHS (año actual) y
    // hasData; el contexto ya está seteado para (mes, país).
    for (const k of Object.keys(c.ind)) {
      acc[k] = round(E.accValue(k, mes));
    }

    perPais[pais] = {
      ind,
      raw,
      acc,
      hcTot: round(c.hcTot),
      prom: round(c.prom),
      edadProm: round(c.edadProm),
      antigProm: round(c.antigProm),
      diasSinAcc: c.diasSinAcc == null ? null : round(c.diasSinAcc),
    };
    cellsWithData++;
  }
  byMonthPais[mes] = perPais;
}

const { indKeys, rawKeys } = engineIndKeys();

const out = {
  meta: {
    today: TODAY_ISO,
    generatedFrom: "out/index.html",
    generator: "indicadores-app/scripts/gen-golden.mjs",
    // Claves del array KPI (27, orden de presentación).
    kpiKeys: KPI_KEYS,
    kpiCount: KPI_KEYS.length,
    // Conjunto completo de indicadores volcados por celda (todos los de ind).
    indKeys,
    indCount: indKeys.length,
    rawKeys,
    paises: PAISES,
    months: Object.keys(byMonthPais).sort(),
    note:
      "Golden del sistema actual. 'ind' = compute(mes).ind (mensual, todas las claves), " +
      "'raw' = compute(mes).raw ([num,den]), 'acc' = accValue(kpi,mes) (YTD, por clave de ind). " +
      "TODAY fijado; se reutiliza como ctx.today en los tests de paridad (tarea 6).",
  },
  byMonthPais,
};

fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + "\n", "utf8");

// --- 7: verificación de cordura + muestras ---
const sampleMonth = byMonthPais["2026-07"] ? "2026-07" : Object.keys(byMonthPais).sort().pop();
const s = byMonthPais[sampleMonth] && byMonthPais[sampleMonth]["__all__"];
console.log(`[gen-golden] TODAY = ${TODAY_ISO}`);
console.log(`[gen-golden] meses cubiertos (${out.meta.months.length}): ${out.meta.months.join(", ")}`);
console.log(`[gen-golden] países: ${PAISES.join(", ")}`);
console.log(`[gen-golden] indicadores por celda: ${indKeys.length} ind / ${rawKeys.length} raw / ${indKeys.length} acc (array KPI = ${KPI_KEYS.length})`);
console.log(`[gen-golden] celdas (mes×país) con datos: ${cellsWithData}`);
if (s) {
  console.log(`[gen-golden] muestra ${sampleMonth} __all__:`);
  console.log(`   hcTot=${s.hcTot}  prom=${s.prom}  edadProm=${s.edadProm?.toFixed?.(2)}  antigProm=${s.antigProm?.toFixed?.(2)}  diasSinAcc=${s.diasSinAcc}`);
  console.log(`   rot_total ind=${s.ind.rot_total}  acc=${s.acc.rot_total}  raw=${JSON.stringify(s.raw.rot_total)}`);
  console.log(`   ausentismo ind=${s.ind.ausentismo}  cap_horas ind=${s.ind.cap_horas}  dias_sin_acc ind=${s.ind.dias_sin_acc}`);
}
console.log(`[gen-golden] escrito: ${path.relative(APP_ROOT, OUT_JSON)}`);

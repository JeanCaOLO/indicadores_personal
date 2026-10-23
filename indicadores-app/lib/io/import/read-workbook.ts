// lib/io/import/read-workbook.ts
//
// Lectura de archivos (XLSX/XLS/CSV) y ruteo de hojas de la Plantilla Maestra.
// Portado desde out/index.html (fuente de verdad), funciones:
//
//   const toMat=ws=>XLSX.utils.sheet_to_json(ws,{header:1,raw:true});   (dentro de masterUpload)
//   function masterUpload(file){...}        → aquí readMasterWorkbook + routeMasterSheets
//   function applySatisfaccion(mat){...}     → aquí applySatisfaccion (pura, sin DB global)
//   function classifySheet(mat){...}         → aquí classifySheet (idéntica)
//
// Esta tarea (16.3) PRODUCE los datos parseados; NO escribe a Supabase. La
// persistencia (replaceByPais / reemplazo por país) es la tarea 16.4.
//
// `xlsx` se carga con DYNAMIC IMPORT (`await import("xlsx")`) para no inflar el
// bundle del servidor/cliente: solo se descarga la librería cuando el usuario
// realmente importa un archivo.
//
// Módulo con un único efecto externo: el dynamic import de "xlsx". El resto es
// puro (trabaja sobre matrices en memoria).

import { parseRows, headRow, type Matrix, type ParsedRow, type ParseOptions } from "./parse-rows";
import { resolveIdx, idxAnio, idxMes } from "./field-alias";
import { NA } from "./normval";
import type { ColmapKind } from "./colmap";

// ---------------------------------------------------------------------------
// Tipos del resultado de la carga maestra
// ---------------------------------------------------------------------------

/** Entidades de datos con reemplazo por mes/país (map kind → filas por mes). */
export type EntidadKind = ColmapKind;

/** Filas agrupadas por clave de mes "YYYY-MM". */
export type PorMes = Record<string, Record<string, string>[]>;

/** Datos parseados de una entidad: filas por mes + campos faltantes. */
export interface EntidadParseada {
  kind: EntidadKind;
  /** Filas por mes "YYYY-MM" (listas para reemplazo por país en 16.4). */
  porMes: PorMes;
  /** Campos requeridos sin columna reconocible (Req 9.6). */
  faltantes: string[];
}

/** Clave canónica de una hoja de parámetros reconocida. */
export type ParamKind =
  | "seleccion"
  | "ssl"
  | "servicios"
  | "bienestar"
  | "ruta";

/** Hoja de parámetros reconocida, expuesta como matriz cruda para 16.5. */
export interface HojaParametros {
  kind: ParamKind;
  /** Nombre original de la hoja en el archivo. */
  sheetName: string;
  /** Matriz cruda (unknown[][]) de la hoja. */
  mat: Matrix;
}

/** Satisfacción laboral anual parseada (año → puntaje). */
export type Satisfaccion = Record<string, number>;

/** Resultado completo de leer/rutear una Plantilla Maestra. */
export interface MasterParseResult {
  /** Entidades de datos parseadas, por kind. */
  entidades: Partial<Record<EntidadKind, EntidadParseada>>;
  /** Hojas de parámetros reconocidas (crudas, para el ParamGrid de 16.5). */
  parametros: HojaParametros[];
  /** Satisfacción anual (año→puntaje) leída de la hoja Satisfacción. */
  satisfaccion: Satisfaccion;
  /**
   * Hojas de matriz de Horas Hombre (nombre + matriz) para su parseo posterior.
   * El parseo de la matriz HH (applyHHSheet) no es parte de esta tarea.
   */
  horasHombre: { sheetName: string; mat: Matrix }[];
  /** Nombres (normalizados con NA) de las hojas que se reconocieron y usaron. */
  usadas: string[];
  /** Total de registros de datos producidos (equivale al `tot` del index). */
  total: number;
  /** Unión de campos requeridos faltantes por entidad (Req 9.6). */
  faltantes: { kind: EntidadKind; campos: string[] }[];
}

/** Entrada aceptada por el lector de workbook. */
export type WorkbookInput = ArrayBuffer | Uint8Array;

// ---------------------------------------------------------------------------
// Lectura de un File/ArrayBuffer con XLSX (dynamic import).
// Soporta .xlsx/.xls y CSV (XLSX también parsea CSV). Devuelve, por hoja, su
// nombre original y su matriz (sheet_to_json con header:1, raw:true).
//
// Portado de masterUpload:
//   const wb=XLSX.read(rd.result,{type:"array",cellDates:true});
//   const toMat=ws=>XLSX.utils.sheet_to_json(ws,{header:1,raw:true});
// ---------------------------------------------------------------------------
export async function readWorkbookSheets(input: WorkbookInput): Promise<{ name: string; mat: Matrix }[]> {
  const XLSX = await import("xlsx");
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const toMat = (ws: unknown): Matrix => XLSX.utils.sheet_to_json(ws as never, { header: 1, raw: true }) as Matrix;
  return wb.SheetNames.map((sn) => ({ name: sn, mat: toMat(wb.Sheets[sn]) }));
}

// ---------------------------------------------------------------------------
// readFileToSheets — conveniencia para un File del navegador. Lee el
// ArrayBuffer y delega en readWorkbookSheets.
// ---------------------------------------------------------------------------
export async function readFileToSheets(file: File): Promise<{ name: string; mat: Matrix }[]> {
  const buf = await file.arrayBuffer();
  return readWorkbookSheets(buf);
}

// ---------------------------------------------------------------------------
// applySatisfaccion — lee AÑO + PUNTAJE y arma el mapa año→puntaje.
// Portado de out/index.html (versión pura: no escribe en DB global; devuelve el
// mapa y deja que 16.4 lo aplique a params/__cfg):
//   function applySatisfaccion(mat){...}
// Devuelve { map, n } donde `n` es la cantidad de años leídos (como el index).
// ---------------------------------------------------------------------------
export function applySatisfaccion(mat: Matrix): { map: Satisfaccion; n: number } {
  const map: Satisfaccion = {};
  if (!mat || !mat.length) return { map, n: 0 };
  let hr = 0;
  for (let i = 0; i < Math.min(mat.length, 6); i++) {
    const rn = ((mat[i] as unknown[]) || []).map(NA);
    if (rn.includes("ano") || rn.includes("anio") || rn.includes("year")) {
      hr = i;
      break;
    }
  }
  const head = ((mat[hr] as unknown[]) || []).map(NA);
  const ai = head.findIndex((h) => h === "ano" || h === "anio" || h === "year");
  const pi = head.findIndex(
    (h) =>
      h.startsWith("puntaje") ||
      h.indexOf("satisf") >= 0 ||
      h.indexOf("esl") >= 0 ||
      h.indexOf("clima") >= 0 ||
      h.indexOf("nota") >= 0 ||
      h.indexOf("promedio") >= 0 ||
      h.indexOf("resultado") >= 0 ||
      h === "valor" ||
      h === "score",
  );
  if (ai < 0 || pi < 0) return { map, n: 0 };
  let n = 0;
  for (let r = hr + 1; r < mat.length; r++) {
    const row = mat[r] as unknown[];
    if (!row) continue;
    const y = parseInt(String(row[ai] == null ? "" : row[ai]).trim());
    const v = parseFloat(String(row[pi] == null ? "" : row[pi]).replace(",", "."));
    if (!y || isNaN(v)) continue;
    map[String(y)] = v;
    n++;
  }
  return { map, n };
}

// ---------------------------------------------------------------------------
// classifySheet — fallback por contenido cuando el nombre de hoja no se
// reconoce. Portado LÍNEA POR LÍNEA de out/index.html:
//   function classifySheet(mat){...}
// ---------------------------------------------------------------------------
export function classifySheet(mat: Matrix): ColmapKind | null {
  if (!mat || !mat.length) return null;
  const head = (mat[0] as unknown[]).map(NA);
  const has = (f: string) => resolveIdx(head, f) >= 0;
  if (has("motivo") || (has("fecha_salida") && has("nombre") && !has("fecha_nacimiento"))) return "egresos";
  if (has("curso") || has("area_conocimiento")) return "capacitacion";
  if (has("dias") && has("tipo")) return "ausencias";
  if (has("horas") && has("area") && !has("nombre")) return "extras";
  if (has("nombre") && (has("fecha_ingreso") || has("nivel") || has("sexo") || has("departamento") || has("movilidad"))) return "activos";
  return null;
}

// ---------------------------------------------------------------------------
// Helpers internos de agrupamiento por mes.
// ---------------------------------------------------------------------------
function agruparPorMes(rows: ParsedRow[]): PorMes {
  const porMes: PorMes = {};
  for (const { key, o } of rows) {
    (porMes[key] = porMes[key] || []).push(o);
  }
  return porMes;
}

function fusionarEntidad(acc: Partial<Record<EntidadKind, EntidadParseada>>, kind: EntidadKind, rows: ParsedRow[], faltantes: string[]) {
  const prev = acc[kind];
  if (!prev) {
    acc[kind] = { kind, porMes: agruparPorMes(rows), faltantes };
    return;
  }
  // Fusiona (p.ej. Incapacidades + Permisos → ausencias).
  for (const { key, o } of rows) {
    (prev.porMes[key] = prev.porMes[key] || []).push(o);
  }
  // Mantiene cualquier campo faltante detectado en cualquiera de las hojas.
  prev.faltantes = Array.from(new Set(prev.faltantes.concat(faltantes)));
}

// ---------------------------------------------------------------------------
// routeMasterSheets — rutea las hojas de la Plantilla Maestra por nombre de
// hoja normalizado (NA), con fallback por contenido (classifySheet).
// Portado del cuerpo de masterUpload (sin la escritura a DB).
//
//   nm.startsWith("activo")       → activos
//   nm.startsWith("egreso")       → egresos
//   nm.startsWith("capacit")      → capacitacion
//   nm.startsWith("horasextra"|"horas_extra") → extras
//   nm.startsWith("horas_hombre"|"horashombre") → matriz Horas Hombre (16.x)
//   nm.startsWith("vacacion")     → vacaciones
//   nm.startsWith("incapacid"|"ausenc"|"permiso") → ausencias (se concatenan)
//   nm.startsWith("merma")        → merma
//   nm.startsWith("tercero")      → terceros
//   nm.startsWith("selecc")       → parámetros: seleccion
//   nm==="ssl" | "seguridad" | "salud laboral" → parámetros: ssl
//   nm.startsWith("servicio")     → parámetros: servicios
//   nm.startsWith("plan") | "bienestar" → parámetros: bienestar
//   nm.startsWith("satisf"|"clima") → applySatisfaccion
//   nm.startsWith("ruta")         → parámetros: ruta
//   else                          → classifySheet (fallback por contenido)
// ---------------------------------------------------------------------------
export function routeMasterSheets(sheets: { name: string; mat: Matrix }[], opts: ParseOptions): MasterParseResult {
  const entidades: Partial<Record<EntidadKind, EntidadParseada>> = {};
  const parametros: HojaParametros[] = [];
  let satisfaccion: Satisfaccion = {};
  const horasHombre: { sheetName: string; mat: Matrix }[] = [];
  const usadas = new Set<string>();
  let total = 0;

  const ingest = (kind: EntidadKind, mat: Matrix) => {
    const { rows, faltantes } = parseRows(kind, mat, opts);
    fusionarEntidad(entidades, kind, rows, faltantes);
    total += rows.length;
    usadas.add(kind);
  };

  const param = (kind: ParamKind, sheetName: string, mat: Matrix) => {
    parametros.push({ kind, sheetName, mat });
    usadas.add(kind);
  };

  for (const { name, mat } of sheets) {
    const nm = NA(name);
    if (nm.startsWith("activo")) ingest("activos", mat);
    else if (nm.startsWith("egreso")) ingest("egresos", mat);
    else if (nm.startsWith("capacit")) ingest("capacitacion", mat);
    else if (nm.startsWith("horasextra") || nm.startsWith("horas_extra")) ingest("extras", mat);
    else if (nm.startsWith("horas_hombre") || nm.startsWith("horashombre")) {
      horasHombre.push({ sheetName: name, mat });
      usadas.add("horas hombre" as never);
    } else if (nm.startsWith("vacacion")) ingest("vacaciones", mat);
    else if (nm.startsWith("incapacid") || nm.startsWith("ausenc") || nm.startsWith("permiso")) ingest("ausencias", mat);
    else if (nm.startsWith("merma")) ingest("merma", mat);
    else if (nm.startsWith("tercero")) ingest("terceros", mat);
    else if (nm.startsWith("selecc")) param("seleccion", name, mat);
    // NOTA: el index compara `nm.indexOf("salud laboral")` con ESPACIO, pero `nm`
    // ya viene normalizado con NA (espacios → "_"), por lo que esa rama nunca
    // matcheaba en el original. Aquí usamos la forma normalizada "salud_laboral"
    // (intención correcta); el caso principal SSL lo cubre `nm === "ssl"`.
    else if (nm === "ssl" || nm.indexOf("seguridad") >= 0 || nm.indexOf("salud_laboral") >= 0) param("ssl", name, mat);
    else if (nm.startsWith("servicio")) param("servicios", name, mat);
    else if (nm.startsWith("plan") || nm.indexOf("bienestar") >= 0) param("bienestar", name, mat);
    else if (nm.startsWith("satisf") || nm.startsWith("clima")) {
      const { map, n } = applySatisfaccion(mat);
      satisfaccion = { ...satisfaccion, ...map };
      total += n;
      usadas.add("satisfaccion" as never);
    } else if (nm.startsWith("ruta")) param("ruta", name, mat);
    else {
      const t = classifySheet(mat);
      if (t) ingest(t, mat);
    }
  }

  const faltantes = Object.values(entidades)
    .filter((e): e is EntidadParseada => !!e && e.faltantes.length > 0)
    .map((e) => ({ kind: e.kind, campos: e.faltantes }));

  return {
    entidades,
    parametros,
    satisfaccion,
    horasHombre,
    usadas: [...usadas],
    total,
    faltantes,
  };
}

// ---------------------------------------------------------------------------
// readMasterWorkbook — lee el archivo y rutea sus hojas en un solo paso.
// Equivale a masterUpload del index (sin la escritura a DB ni la UI/toast).
// `xlsx` se carga con dynamic import dentro de readWorkbookSheets.
// ---------------------------------------------------------------------------
export async function readMasterWorkbook(input: WorkbookInput, opts: ParseOptions): Promise<MasterParseResult> {
  const sheets = await readWorkbookSheets(input);
  return routeMasterSheets(sheets, opts);
}

// ---------------------------------------------------------------------------
// readSingleSheet — lee un archivo de una sola hoja (XLSX/XLS/CSV) y lo parsea
// como un `kind` dado. Equivale a `upload(kind,file)` + `ingest(kind,mat)` del
// index (toma la PRIMERA hoja). Devuelve filas por mes y campos faltantes.
// ---------------------------------------------------------------------------
export async function readSingleSheet(input: WorkbookInput, kind: ColmapKind, opts: ParseOptions): Promise<EntidadParseada> {
  const sheets = await readWorkbookSheets(input);
  const mat = sheets.length ? sheets[0].mat : [];
  const { rows, faltantes } = parseRows(kind, mat, opts);
  return { kind, porMes: agruparPorMes(rows), faltantes };
}

// Re-exporta headRow por conveniencia (vive en parse-rows.ts).
export { headRow };

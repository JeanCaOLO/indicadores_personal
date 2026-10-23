// =============================================================================
// supabase/migrate/clean.ts
//
// Port PURO de `limpiarMesesVacios()` del Sistema_Actual (out/index.html).
//
// En el monolito la función recorría el objeto DB (clave/valor) y descartaba
// las claves `YYYY-MM` que no tenían ningún dato real: sin registros en los
// arrays de entidades, sin ningún parámetro numérico truthy, sin arrays de
// nivel (headcount / sucesión) con datos y sin `fecha_ult_accidente`.
//
// Aquí vive como parte del proceso de migración (tarea 8.3): se usa para NO
// migrar los ~170 meses basura del snapshot kv hacia el esquema normalizado.
//
// A diferencia del original (que MUTABA el DB global con `delete DB[k]` y
// devolvía el conteo), esta versión es PURA: recibe un `db` y devuelve qué
// claves se conservan y cuáles se descartan, SIN mutar el input.
//
// _Requirements: 15.1_
// =============================================================================

/** Arrays de entidades por mes (copiado EXACTO del Sistema_Actual). */
const ARR = [
  "activos",
  "egresos",
  "ausencias",
  "areas",
  "capacitacion",
  "extras",
  "vacaciones",
  "merma",
  "terceros",
] as const;

/**
 * Lista `pnum` de parámetros numéricos (copiada EXACTO del Sistema_Actual).
 * Si ALGUNO es truthy (`+p[f]`), el mes se considera con datos.
 */
const PNUM = [
  "prom_colab",
  "nuevos",
  "colab_vac",
  "vac_dias",
  "vac_cant",
  "of_contactados",
  "of_descartados",
  "of_realizadas",
  "of_rechazadas",
  "rot_ini",
  "rot_egr",
  "des_ing12",
  "des_egr12",
  "mant_cierre",
  "accidentes",
  "incidentes",
  "colab_accid",
  "mant_plan",
  "ot_dias",
  "horas_hombre",
  "hh_ord",
  "hh_ext",
  "ruta_basicas",
  "ruta_tecnicas",
  "ruta_liderazgo",
  "record_dias",
] as const;

/** Arrays de nivel (headcount indeterminado/determinado y sucesión P45). */
const LVL = ["hc_indet", "hc_det", "suc_p45"] as const;

/** Patrón de clave de mes `YYYY-MM`. */
const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Forma mínima de un valor de mes en el snapshot kv (entrada cruda).
 * Se tipa de forma laxa porque proviene directamente del JSON kv original.
 */
type RawMonth = Record<string, unknown> & {
  params?: Record<string, unknown> | null;
};

/** El snapshot kv crudo: `{ [key]: value }`, incluyendo `__cfg`. */
export type RawDB = Record<string, unknown>;

export interface CleanResult {
  /** Claves `YYYY-MM` que se conservan (tienen datos reales). */
  kept: string[];
  /** Claves `YYYY-MM` descartadas por estar vacías. */
  removed: string[];
  /** `db` limpio: copia superficial del input sin las claves `removed`. */
  db: RawDB;
}

/**
 * Determina si una clave `YYYY-MM` tiene datos reales, replicando EXACTO la
 * condición del Sistema_Actual:
 *   rec    = algún array de entidades con length
 *   numOk  = algún parámetro de `pnum` truthy (`+p[f]`)
 *   lvl    = algún array de nivel con algún valor truthy
 *   mantiene el mes si rec || numOk || lvl || p.fecha_ult_accidente
 */
function monthHasData(d: RawMonth | null | undefined): boolean {
  if (!d) return false;

  const rec = ARR.some((f) => {
    const v = (d as Record<string, unknown>)[f];
    return Array.isArray(v) && v.length > 0;
  });

  const p: Record<string, unknown> = d.params ?? {};

  const numOk = PNUM.some((f) => Boolean(+(p[f] as number)));

  const lvl = LVL.some((f) => {
    const v = p[f];
    return Array.isArray(v) && v.some((x) => Boolean(+(x as number)));
  });

  return rec || numOk || lvl || Boolean(p.fecha_ult_accidente);
}

/**
 * Port PURO de `limpiarMesesVacios`.
 *
 * Recibe el snapshot kv crudo (`{ key: value }`, incluye `__cfg`) y devuelve
 * las claves conservadas/descartadas más un `db` limpio (copia superficial sin
 * las claves vacías). NO muta el input.
 *
 * Reglas (idénticas al Sistema_Actual):
 *  - Las claves que no son `YYYY-MM` (p. ej. `__cfg`) se conservan siempre.
 *  - Una clave `YYYY-MM` se descarta si NO tiene registros en los arrays de
 *    entidades, NI parámetros numéricos truthy, NI arrays de nivel con datos,
 *    NI `fecha_ult_accidente`.
 */
export function limpiarMesesVacios(db: RawDB): CleanResult {
  const kept: string[] = [];
  const removed: string[] = [];
  const out: RawDB = {};

  for (const k of Object.keys(db)) {
    // Claves no-mes (como `__cfg`) se conservan tal cual.
    if (k === "__cfg" || !MONTH_RE.test(k)) {
      out[k] = db[k];
      continue;
    }

    const d = db[k] as RawMonth | null | undefined;
    if (monthHasData(d)) {
      kept.push(k);
      out[k] = db[k];
    } else {
      removed.push(k);
    }
  }

  return { kept, removed, db: out };
}

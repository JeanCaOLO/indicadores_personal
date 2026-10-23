// =============================================================================
// lib/data/assemble.ts
//
// Capa de ENSAMBLAJE: reconstruye la forma que el motor (`core/compute.ts`)
// espera — un `ConfigDB` { __cfg: ConfigGlobal, [mes]: MesData } — a partir de
// las filas de las tablas normalizadas `ind_*` (tipos en `supabase/types.ts`).
//
// El motor no sabe que la base de datos cambió de kv (una clave por mes) a un
// esquema normalizado. Esta capa es el "pegamento" puro que toma las filas
// tabulares (ya filtradas por mes/país vía RLS en la query de la tarea 9.3) y
// vuelve a armar el objeto `DB` original que compute() consumía. Así la
// paridad numérica se mantiene sin tocar el motor.
//
// Funciones:
//   - normalizeParams(raw): ParametrosMes
//       Toma el JSONB `params` crudo (o {}) y garantiza EXACTAMENTE la forma
//       que compute() espera: arrays hc_indet/hc_det/suc_p45 de longitud 5 y
//       los defaults que `blankMonth()` + `M()` del motor inicializan. El resto
//       de params se mantiene tal cual (el motor ya coacciona con `+x`).
//
//   - assembleMesData(input): MesData
//       Recibe las filas de cada entidad para UN mes (y país) y arma el MesData.
//
//   - assembleDB(input): ConfigDB
//       Recibe filas de MUCHOS meses + la config, agrupa por mes y arma el
//       ConfigDB completo (incluye __cfg reconstruido desde las tablas de config).
//
// PUREZA: sin I/O, sin Supabase. Solo transforma datos en memoria. La lectura
// (RLS, queries) vive en `lib/data/queries.ts` (tarea 9.3).
//
// -----------------------------------------------------------------------------
// DECISIÓN DE MODELADO — CÉDULAS SINTÉTICAS
// -----------------------------------------------------------------------------
// La migración (supabase/migrate/migrate-data.ts, decisión #1) convierte las
// cédulas vacías de `activos` en una cédula sintética estable `__row_<i>` para
// no colapsar la PK (cedula, mes, pais). Al ensamblar de vuelta mapeamos
// `cedula → Colaborador.id` TAL CUAL (incluidas las sintéticas `__row_<i>`).
// Justificación: el motor compute() NUNCA usa `id` como dato numérico ni de
// agrupación (agrupa por sexo, nivel, área, depto, movilidad… nunca por id), así
// que conservar `__row_<i>` no altera ningún KPI ni agregado. Mapear tal cual es
// lo más simple y mantiene la trazabilidad de la fila original. Si en el futuro
// una vista necesitara mostrar la cédula "real", bastaría con blanquear las que
// empiezan por "__row_" en la capa de presentación, no aquí.
//
// _Requirements: 11.3, 17.1_
// =============================================================================

import type {
  Area,
  Ausencia,
  Capacitacion,
  Colaborador,
  ConfigDB,
  ConfigGlobal,
  Egreso,
  Extra,
  MesData,
  Merma,
  MonthKey,
  ParametrosMes,
  Tercero,
  Vacacion,
} from "../../core/types";
import type {
  IndAreaRow,
  IndAusenciaRow,
  IndCapacitacionRow,
  IndColaboradorRow,
  IndConfigKvRow,
  IndConfigLeadersRow,
  IndConfigMetasRow,
  IndConfigKpiOffRow,
  IndConfigSatisfaccionRow,
  IndEgresoRow,
  IndExtraRow,
  IndMermaRow,
  IndParametrosMesRow,
  IndTerceroRow,
  IndVacacionRow,
} from "../../supabase/types";

// ===========================================================================
// normalizeParams
// ===========================================================================

/**
 * Garantiza que un array de headcount por nivel tenga EXACTAMENTE 5 posiciones
 * (N1..N5), rellenando con 0 lo que falte y descartando sobrantes. Replica la
 * forma que `blankMonth()` crea (`[0,0,0,0,0]`) y que compute() indexa con
 * `p.hc_indet[i]` para i en 0..4 (NIV de 5 niveles).
 */
function arr5(raw: unknown): number[] {
  const out = [0, 0, 0, 0, 0];
  if (Array.isArray(raw)) {
    for (let i = 0; i < 5; i++) {
      const v = raw[i];
      // El motor coacciona con `+x`; aquí solo garantizamos longitud y que no
      // queden `undefined`. Dejamos el valor tal cual si es finito, si no 0.
      const n = v == null ? 0 : +v;
      out[i] = Number.isFinite(n) ? n : 0;
    }
  }
  return out;
}

/**
 * Escalares que `M()` del motor fuerza a 0 cuando llegan como `null`/`undefined`
 * (lista literal de compute.ts: `["mant_cierre", …, "horas_hombre"]`).
 * Al ensamblar desde la base, un `params` crudo puede no traer estos campos
 * (JSONB parcial); garantizamos 0 para que compute() funcione idéntico.
 */
const NULL_TO_ZERO_FIELDS = [
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
] as const;

/**
 * Normaliza el `params` crudo (JSONB de `ind_parametros_mes.params`, o `{}`) a
 * un `ParametrosMes` con la forma que compute() espera.
 *
 * Replica EXACTAMENTE la inicialización que hace el motor en `blankMonth()` +
 * `M()`:
 *   - `hc_indet` / `hc_det` / `suc_p45` → arrays de longitud 5 (rellena con 0).
 *   - campos de `NULL_TO_ZERO_FIELDS` → 0 si vienen null/undefined (igual que M()).
 *   - `fecha_ult_accidente` → "" si viene null/undefined (igual que M()).
 *
 * El RESTO de los parámetros se mantiene TAL CUAL: la coerción numérica la hace
 * el motor con `+x` en cada uso, así que no tocamos esos valores aquí para no
 * introducir diferencias. No se agrega `dias_habiles` por defecto: el motor ya
 * cae a `bizDaysInMonth(k)` cuando no viene > 0 (y `blankMonth` usa 21 solo para
 * meses totalmente ausentes, caso que cubre el fallback de assembleMesData).
 *
 * @param raw El JSONB crudo de params, o null/undefined/{} si no hay fila.
 */
export function normalizeParams(raw: unknown): ParametrosMes {
  const src: Record<string, unknown> =
    raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};

  const out: Record<string, unknown> = { ...src };

  // Arrays de 5 por nivel (rellenar con 0).
  out.hc_indet = arr5(src.hc_indet);
  out.hc_det = arr5(src.hc_det);
  out.suc_p45 = arr5(src.suc_p45);

  // Escalares que M() fuerza a 0 si llegan null/undefined.
  for (const f of NULL_TO_ZERO_FIELDS) {
    if (out[f] == null) out[f] = 0;
  }

  // fecha_ult_accidente → "" si null/undefined (igual que M()).
  if (out.fecha_ult_accidente == null) out.fecha_ult_accidente = "";

  return out as unknown as ParametrosMes;
}

// ===========================================================================
// assembleMesData
// ===========================================================================

/**
 * Filas de un mes (ya filtradas por mes y, según el consultante, por país vía
 * RLS) + el `params` crudo de `ind_parametros_mes` para ese mes/país.
 *
 * Nota sobre `areas`: `ind_areas` NO tiene columna `pais` en el esquema (igual
 * que el sistema actual), así que llega sin filtrar por país.
 */
export interface AssembleMesInput {
  colaboradores: IndColaboradorRow[];
  egresos: IndEgresoRow[];
  ausencias: IndAusenciaRow[];
  vacaciones: IndVacacionRow[];
  extras: IndExtraRow[];
  capacitacion: IndCapacitacionRow[];
  merma: IndMermaRow[];
  terceros: IndTerceroRow[];
  areas: IndAreaRow[];
  /** JSONB crudo de params para el mes/país, o null si no hay fila. */
  params: unknown | null;
}

/** Convierte null → "" para campos de texto que el dominio tipa como string. */
function s(v: string | null | undefined): string {
  return v == null ? "" : v;
}

/**
 * Arma el `MesData` de UN mes a partir de sus filas normalizadas.
 *
 * Cada entidad se mapea a la forma del dominio (`core/types.ts`). Los campos
 * coinciden 1:1 con las columnas `ind_*`; la coerción numérica (`+x`) la hace
 * el motor, así que aquí los numéricos se pasan tal cual llegan (number de la
 * base). Los textos nullable se normalizan a "" para respetar los tipos del
 * dominio (que no admiten null en esos campos).
 *
 * `params` se normaliza con `normalizeParams`; si no hay fila (`null`), se parte
 * de `{}` y `normalizeParams` garantiza la forma mínima que compute() necesita.
 */
export function assembleMesData(input: AssembleMesInput): MesData {
  const activos: Colaborador[] = input.colaboradores.map((r) => ({
    // cedula → id tal cual (incluye sintéticas __row_<i>; ver decisión arriba).
    id: s(r.cedula),
    pais: s(r.pais),
    nombre: s(r.nombre),
    departamento: s(r.departamento),
    area: s(r.area),
    sexo: s(r.sexo) as Colaborador["sexo"],
    fecha_nacimiento: s(r.fecha_nacimiento),
    fecha_ingreso: s(r.fecha_ingreso),
    nivel: s(r.nivel),
    nivel_educativo: s(r.nivel_educativo) as Colaborador["nivel_educativo"],
    carrera: s(r.carrera),
    movilidad: s(r.movilidad),
    movimiento: s(r.movimiento),
    tipo: s(r.tipo) as Colaborador["tipo"],
    paso: s(r.paso),
    vac_disfrutadas: r.vac_disfrutadas,
    vac_pendientes: r.vac_pendientes,
  }));

  const egresos: Egreso[] = input.egresos.map((r) => ({
    id: s(r.cedula),
    pais: s(r.pais),
    nombre: s(r.nombre),
    departamento: s(r.departamento),
    motivo: s(r.motivo),
    fecha_ingreso: s(r.fecha_ingreso),
    fecha_salida: s(r.fecha_salida),
    movilidad: s(r.movilidad),
    recomienda: s(r.recomienda) as Egreso["recomienda"],
  }));

  const ausencias: Ausencia[] = input.ausencias.map((r) => ({
    id: s(r.cedula),
    pais: s(r.pais),
    nombre: s(r.nombre),
    departamento: s(r.departamento),
    tipo: s(r.tipo),
    dias: r.dias,
  }));

  const vacaciones: Vacacion[] = input.vacaciones.map((r) => ({
    id: s(r.cedula),
    pais: s(r.pais),
    nombre: s(r.nombre),
    departamento: s(r.departamento),
    area: s(r.area),
    dias: r.dias,
  }));

  const extras: Extra[] = input.extras.map((r) => ({
    id: s(r.cedula),
    pais: s(r.pais),
    nombre: s(r.nombre),
    departamento: s(r.departamento),
    area: s(r.area),
    horas: r.horas,
  }));

  const capacitacion: Capacitacion[] = input.capacitacion.map((r) => ({
    pais: s(r.pais),
    area_conocimiento: s(r.area_conocimiento),
    curso: s(r.curso),
    horas: r.horas,
    participantes: r.participantes,
  }));

  const merma: Merma[] = input.merma.map((r) => ({
    pais: s(r.pais),
    area: s(r.area),
    cantidad: r.cantidad,
  }));

  const terceros: Tercero[] = input.terceros.map((r) => ({
    pais: s(r.pais),
    cantidad: r.cantidad,
  }));

  // `ind_areas` no tiene país (igual que el sistema actual).
  const areas: Area[] = input.areas.map((r) => ({
    grupo: s(r.grupo),
    area: s(r.area),
    colaboradores: r.colaboradores,
  }));

  return {
    activos,
    egresos,
    ausencias,
    vacaciones,
    extras,
    capacitacion,
    merma,
    terceros,
    areas,
    params: normalizeParams(input.params),
  };
}

// ===========================================================================
// assembleDB
// ===========================================================================

/**
 * Filas de MUCHOS meses (todas las entidades) + las filas de las tablas de
 * config. Las filas ya vienen filtradas por RLS (no es responsabilidad de esta
 * capa aplicar seguridad). Cada array puede cubrir varios meses; `assembleDB`
 * las agrupa por `mes`.
 *
 * Las tablas de config no llevan `mes`: describen el estado global (`__cfg`).
 */
export interface AssembleDBInput {
  colaboradores: IndColaboradorRow[];
  egresos: IndEgresoRow[];
  ausencias: IndAusenciaRow[];
  vacaciones: IndVacacionRow[];
  extras: IndExtraRow[];
  capacitacion: IndCapacitacionRow[];
  merma: IndMermaRow[];
  terceros: IndTerceroRow[];
  areas: IndAreaRow[];
  parametros: IndParametrosMesRow[];
  config: AssembleConfigInput;
}

/** Filas de las tablas de config, para reconstruir `ConfigGlobal` (__cfg). */
export interface AssembleConfigInput {
  metas: IndConfigMetasRow[];
  leaders: IndConfigLeadersRow[];
  kpiOff: IndConfigKpiOffRow[];
  satisfaccion: IndConfigSatisfaccionRow[];
  kv: IndConfigKvRow[];
}

/** Agrupa filas con columna `mes` en un Map<mes, fila[]>. */
function groupByMes<T extends { mes: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.mes);
    if (list) list.push(r);
    else m.set(r.mes, [r]);
  }
  return m;
}

/**
 * Reconstruye `ConfigGlobal` (__cfg) desde las tablas de config:
 *   - metas        ← ind_config_metas    (una fila por KPI con [a,b]; a/b pueden ser null)
 *   - leaders      ← ind_config_leaders
 *   - kpiOff       ← ind_config_kpi_off
 *   - satisfaccion ← ind_config_satisfaccion (indexada por año como string)
 *   - sysUrl       ← ind_config_kv (key = "sysUrl")
 *
 * `metas[kpi]` es `[a,b]` solo si AMBOS valores existen; si falta alguno, se
 * guarda `null` (sin meta configurada), coherente con el tipo del dominio.
 */
export function assembleConfig(input: AssembleConfigInput): ConfigGlobal {
  const metas: Record<string, [number, number] | null> = {};
  for (const r of input.metas) {
    metas[r.kpi] = r.a != null && r.b != null ? [r.a, r.b] : null;
  }

  const leaders = input.leaders.map((r) => ({
    area: r.area,
    lider: s(r.lider),
    correo: s(r.correo),
  }));

  const kpiOff = input.kpiOff.map((r) => r.kpi);

  const satisfaccion: Record<string, number> = {};
  for (const r of input.satisfaccion) {
    if (r.valor != null) satisfaccion[String(r.anio)] = r.valor;
  }

  const sysUrlRow = input.kv.find((r) => r.key === "sysUrl");
  const sysUrl = sysUrlRow ? s(sysUrlRow.value) : "";

  return { metas, leaders, sysUrl, kpiOff, satisfaccion };
}

/**
 * Arma el `ConfigDB` completo a partir de las filas de muchos meses + config.
 *
 * Agrupa cada entidad por `mes` y, para cada mes presente, llama a
 * `assembleMesData`. El resultado tiene la MISMA forma que el `DB` original:
 * `{ __cfg, [mes]: MesData }`, de modo que compute()/M()/desercion12() lo
 * consumen idéntico.
 *
 * Los `params` se indexan por `mes` (si hay varias filas del mismo mes —una por
 * país— se usa la primera; en el modelo migrado todas las filas de un mes
 * comparten el mismo JSONB, ver decisión #2 de la migración). Las filas ya
 * vienen filtradas por país vía RLS, así que esa primera fila es la del scope
 * del consultante.
 */
export function assembleDB(input: AssembleDBInput): ConfigDB {
  const colabByMes = groupByMes(input.colaboradores);
  const egByMes = groupByMes(input.egresos);
  const ausByMes = groupByMes(input.ausencias);
  const vacByMes = groupByMes(input.vacaciones);
  const extByMes = groupByMes(input.extras);
  const capByMes = groupByMes(input.capacitacion);
  const mermaByMes = groupByMes(input.merma);
  const tercByMes = groupByMes(input.terceros);
  const areasByMes = groupByMes(input.areas);
  const paramsByMes = groupByMes(input.parametros);

  // El universo de meses = unión de todos los meses que aparecen en cualquier
  // tabla con datos o parámetros.
  const meses = new Set<string>();
  for (const map of [
    colabByMes,
    egByMes,
    ausByMes,
    vacByMes,
    extByMes,
    capByMes,
    mermaByMes,
    tercByMes,
    areasByMes,
    paramsByMes,
  ]) {
    for (const k of map.keys()) meses.add(k);
  }

  const db: ConfigDB = {
    __cfg: assembleConfig(input.config),
  } as ConfigDB;

  for (const mes of meses) {
    const paramRows = paramsByMes.get(mes);
    const mesData = assembleMesData({
      colaboradores: colabByMes.get(mes) ?? [],
      egresos: egByMes.get(mes) ?? [],
      ausencias: ausByMes.get(mes) ?? [],
      vacaciones: vacByMes.get(mes) ?? [],
      extras: extByMes.get(mes) ?? [],
      capacitacion: capByMes.get(mes) ?? [],
      merma: mermaByMes.get(mes) ?? [],
      terceros: tercByMes.get(mes) ?? [],
      areas: areasByMes.get(mes) ?? [],
      params: paramRows && paramRows.length ? paramRows[0].params : null,
    });
    db[mes as MonthKey] = mesData;
  }

  return db;
}

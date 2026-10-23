// core/types.ts
//
// Tipos del dominio del motor de indicadores.
// Son la frontera entre la capa de datos y el motor (`compute`).
// Portados fielmente desde el diseño (.kiro/specs/indicadores-app/design.md,
// sección "Tipos del dominio (TypeScript)") y cruzados contra:
//   - out/index.html → COLMAP (orden y nombres de campos de cada entidad)
//   - test/fixtures/db.snapshot.json → forma real de params y registros
//
// NOTA SOBRE DATOS HETEROGÉNEOS (fuente de verdad: db.snapshot.json):
// En el snapshot real, TODOS los campos de los registros de entidades se
// almacenan como `string` (p.ej. `dias: "15.5"`, `vac_pendientes: "3"`), y
// el motor del index.html los coacciona con `+x` en cada uso. Para reflejar
// esa realidad sin romper paridad, los campos numéricos de las entidades se
// tipan como `number | string`: mantienen la intención "ideal" (number) pero
// admiten el string crudo que llega de la base. La capa de ensamblaje
// (normalizeParams / assemble) y el motor normalizan con `+valor`.
// Los parámetros (`ParametrosMes`) sí llegan ya como `number` en el snapshot,
// pero se documentan igual porque el motor también hace `+x` por todos lados.

/** Clave de mes en formato "YYYY-MM". */
export type MonthKey = `${number}-${number}`;

export type Pais = "Costa Rica" | "Venezuela" | (string & {});
export type PaisScope = "__all__" | Pais;

export type Sexo = "Masculino" | "Femenino" | "Otro" | "";
export type Movilidad = "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7 NN" | (string & {});
export type NivelEducativo =
  | "Primaria"
  | "Secundaria"
  | "Técnico"
  | "Universitario"
  | "Posgrado"
  | "";
export type Movimiento = "Promoción" | "Ascenso" | "Sin cambio" | (string & {});
export type TipoContrato = "Indeterminado" | "Determinado";
export type MotivoEgreso =
  | "Renuncia"
  | "Despido"
  | "Finalización"
  | "Jubilación"
  | "Mutuo acuerdo"
  | (string & {});

/**
 * Alcance de un rol (definido en lib/auth/rbac.ts). Se re-declara aquí para
 * que `Rol` sea autocontenido en core/types.ts.
 */
export type Scope = "global" | "pais" | "admin";

// ===========================================================================
// Entidades de datos (una fila por registro dentro de un mes/país)
// El orden de los campos replica COLMAP del index.html.
// ===========================================================================

/** "activos" — COLMAP.activos. `id` = cédula (clave natural de la persona, Req 11.2). */
export interface Colaborador {
  id: string; // CÉDULA
  pais: Pais;
  nombre: string;
  departamento: string;
  area: string;
  sexo: Sexo;
  fecha_nacimiento: string; // ISO YYYY-MM-DD
  fecha_ingreso: string; // ISO YYYY-MM-DD
  nivel: string; // N1..N5
  nivel_educativo: NivelEducativo;
  carrera: string;
  movilidad: Movilidad;
  movimiento: Movimiento;
  tipo: TipoContrato;
  paso: string; // "1".."5"
  vac_disfrutadas: number | string; // fuente puede traer string; motor hace +x
  vac_pendientes: number | string;
}

/** "egresos" — COLMAP.egresos. */
export interface Egreso {
  id: string;
  pais: Pais;
  nombre: string;
  departamento: string;
  motivo: MotivoEgreso;
  fecha_ingreso: string; // ISO
  fecha_salida: string; // ISO
  movilidad: Movilidad;
  recomienda: "Sí" | "No" | "";
}

/** "ausencias" — COLMAP.ausencias (incapacidades, permisos, vacaciones). */
export interface Ausencia {
  id: string;
  pais: Pais;
  nombre: string;
  departamento: string;
  tipo: string;
  dias: number | string; // fuente puede traer string; motor hace +x
}

/** "vacaciones" — COLMAP.vacaciones. */
export interface Vacacion {
  id: string;
  pais: Pais;
  nombre: string;
  departamento: string;
  area: string;
  dias: number | string;
}

/** "extras" — COLMAP.extras (horas extras). */
export interface Extra {
  id: string;
  pais: Pais;
  nombre: string;
  departamento: string;
  area: string;
  horas: number | string;
}

/** "capacitacion" — COLMAP.capacitacion. */
export interface Capacitacion {
  pais: Pais;
  area_conocimiento: string;
  curso: string;
  horas: number | string;
  participantes: number | string;
}

/** "merma" — COLMAP.merma. */
export interface Merma {
  pais: Pais;
  area: string;
  cantidad: number | string;
}

/** "terceros" — COLMAP.terceros (una fila por país con la cantidad del mes). */
export interface Tercero {
  pais: Pais;
  cantidad: number | string;
}

/** "areas" — COLMAP.areas. NO lleva país en el sistema actual. */
export interface Area {
  grupo: string;
  area: string;
  colaboradores: number | string;
}

// ===========================================================================
// Parámetros del mes (~40 parámetros heterogéneos por mes/país)
// Arrays de 5 por nivel + escalares + fechas + strings.
// Los valores llegan como number en el snapshot, pero el motor coacciona con
// `+x`; se mantiene el tipo "ideal" (number) para los escalares numéricos.
// ===========================================================================
export interface ParametrosMes {
  // Headcount por nivel (arrays de 5: N1..N5)
  hc_indet: number[]; // indeterminados por nivel
  hc_det: number[]; // determinados por nivel
  suc_p45: number[]; // sucesión P4/P5 por nivel

  // Vacaciones (parámetro manual)
  vac_dias: number;
  vac_cant: number;
  vac_fecha: string;

  // Ofertas / selección
  of_realizadas: number;
  of_rechazadas: number;
  of_descartados: number;
  of_contactados: number;

  // Rotación / deserción
  rot_ini: number;
  rot_egr: number;
  des_egr12: number;
  des_ing12: number;

  // Base del mes
  dias_habiles: number;
  nuevos: number;
  prom_colab: number;
  colab_vac: number;

  // Mantenimiento / seguridad
  mant_cierre: number;
  accidentes: number;
  capacitados: number;
  incidentes: number;
  colab_accid: number;
  mant_plan: number;
  ot_dias: number;
  mant_prev: number; // normaliza %: (v>1 ? v/100 : v)
  record_dias: number;

  // Satisfacción / accidentes
  encuesta: number; // precedencia param → cfg.satisfaccion[año]
  fecha_ult_accidente: string; // ISO
  accid_area: string;

  // Rutas de capacitación
  ruta_basicas: number;
  ruta_tecnicas: number;
  ruta_liderazgo: number;

  // Merma
  merma_hurto: number;

  // Plan anual de bienestar (presentes en el snapshot real)
  bien_plan?: number;
  bien_ejec?: number;
  bien_cumpl?: number;

  // Horas hombre (total y partición ordinaria/extra; categorías por etiqueta)
  horas_hombre?: number;
  hh_ord?: number;
  hh_ext?: number;
  hh_cat?: Record<string, { ord: number; ext: number }>;

  // Permite parámetros adicionales sin romper la forma que compute() espera.
  [extra: string]: unknown;
}

/** Lo que `compute()` consume para un mes. */
export interface MesData {
  activos: Colaborador[];
  egresos: Egreso[];
  ausencias: Ausencia[];
  vacaciones: Vacacion[];
  extras: Extra[];
  capacitacion: Capacitacion[];
  merma: Merma[];
  terceros: Tercero[];
  areas: Area[];
  params: ParametrosMes;
}

/** Configuración global del sistema ("__cfg"). */
export interface ConfigGlobal {
  /** Umbrales por KPI (override de `it.t`). `null` = sin meta configurada. */
  metas: Record<string, [number, number] | null>;
  leaders: { area: string; lider: string; correo: string }[];
  sysUrl: string;
  /** KPIs desactivados (por clave). */
  kpiOff: string[];
  /** Satisfacción por año: { "2025": 4.1 }. */
  satisfaccion: Record<string, number>;
}

/** El "DB" completo: config global + un MesData por cada clave de mes. */
export interface ConfigDB {
  __cfg: ConfigGlobal;
  [mes: MonthKey]: MesData;
}

// ===========================================================================
// Definiciones de KPIs y grupos
// ===========================================================================
export type KpiType = "pct" | "int" | "days" | "num";

export interface KPI {
  k: string; // clave
  name: string;
  unit: string;
  type: KpiType;
  lower?: boolean; // dirección: true = menor es mejor
  info?: boolean; // informativo (sin semáforo)
  esl?: boolean; // usa bandas ESL de satisfacción
  t?: [number, number]; // umbrales [a, b]
  def: string; // definición/descripción
}

export interface Grupo {
  g: string;
  area: string;
  sub: string;
  items: KPI[];
}

// ===========================================================================
// Roles y perfiles (Supabase Auth)
// ===========================================================================
export interface Rol {
  id: string;
  nombre: string;
  scope: Scope;
  pais: string | null;
}

export interface Perfil {
  user_id: string;
  email: string;
  nombre: string;
  rol_id: string;
  rol?: Rol;
  activo: boolean;
}

// ===========================================================================
// Contexto y resultado del motor
// ===========================================================================

/** Reemplaza los globales del index.html (PAIS, DEP, AREA, TODAY, CUR). */
export interface ComputeContext {
  pais: string; // "__all__" | "Costa Rica" | "Venezuela"  (reemplaza PAIS)
  dep: string; // "__all__" | nombre de departamento        (reemplaza DEP)
  area: string; // "__all__" | nombre de área               (reemplaza AREA)
  today: Date; // reemplaza TODAY (inyectable para tests deterministas)
  dashYear: number; // año del dashboard (reemplaza +CUR.slice(0,4))
}

export interface ComputeResult {
  /** Valor final por KPI (null = no disponible / movimStatus). */
  ind: Record<string, number | null>;
  /** Pares [numerador, denominador] por KPI, para los acumulados. */
  raw: Record<string, [number, number]>;

  // Agregados de roster para las vistas.
  hcTot: number;
  prom: number;
  edadProm: number;
  antigProm: number;
  diasSinAcc: number | null;

  // Distribuciones y agregados extra (hcN, sexoC, educC, egByDep, horas hombre…).
  [extra: string]: unknown;
}

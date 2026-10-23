// =============================================================================
// components/admin/admin-constants.ts
//
// Constantes y metadata de la Pantalla Administrar (tarea 16.5). Portadas 1:1
// desde out/index.html (fuente de verdad), bloque "/* ---------- admin ----- */":
//   - COLMAP        → columnas (y su orden) por tipo de entidad editable.
//   - DEPTS/AREAS/… → listas de opciones de los <select> de `cellInput`.
//   - PGROUPS       → grupos de ParametrosMes (selección, clima, SSL, servicios,
//                     bienestar, ruta) con sus campos editables.
//
// Son datos PUROS (sin DOM, sin estado): los consume el client component
// AdminClient para renderizar las tarjetas por tipo (dataCard) y el ParamGrid,
// con paridad de campos/orden respecto del sistema actual.
// =============================================================================

/** Tipos de entidad editables en las tarjetas por tipo (dataCard). */
export type EntKind =
  | "activos"
  | "egresos"
  | "ausencias"
  | "vacaciones"
  | "extras"
  | "terceros"
  | "merma"
  | "capacitacion";

/**
 * COLMAP — columnas por entidad (orden y nombres idénticos al index). Define
 * qué columnas muestra y edita la tabla de cada tarjeta (EditableTable).
 */
export const COLMAP: Record<EntKind, string[]> = {
  activos: [
    "id",
    "pais",
    "nombre",
    "departamento",
    "area",
    "sexo",
    "fecha_nacimiento",
    "fecha_ingreso",
    "nivel",
    "nivel_educativo",
    "carrera",
    "movilidad",
    "movimiento",
    "tipo",
    "paso",
    "vac_disfrutadas",
    "vac_pendientes",
  ],
  terceros: ["pais", "cantidad"],
  extras: ["id", "pais", "nombre", "departamento", "area", "horas"],
  merma: ["pais", "area", "cantidad"],
  egresos: [
    "id",
    "pais",
    "nombre",
    "departamento",
    "motivo",
    "fecha_ingreso",
    "fecha_salida",
    "movilidad",
    "recomienda",
  ],
  vacaciones: ["id", "pais", "nombre", "departamento", "area", "dias"],
  ausencias: ["id", "pais", "nombre", "departamento", "tipo", "dias"],
  capacitacion: ["pais", "area_conocimiento", "curso", "horas", "participantes"],
};

// ---------------------------------------------------------------------------
// Listas de opciones de los <select> (cellInput del index), 1:1.
// ---------------------------------------------------------------------------
export const DEPTS = [
  "Comercio Exterior",
  "Control",
  "IMC",
  "Logistica In",
  "Logistica Out",
  "Personal",
  "Sistemas",
  "Ventas",
];
export const MOTIVOS = ["Renuncia", "Despido", "Finalización", "Otro"];
export const CONTRATO = ["Indeterminado", "Determinado"];
export const AUSTIPOS = [
  "Incapacidad CCSS",
  "Incapacidad INS",
  "Maternidad",
  "Paternidad",
  "Permiso con goce",
  "Permiso sin goce",
  "Vacaciones",
];
export const NIV = ["N1", "N2", "N3", "N4", "N5"];
export const AREAS = [
  "Centro de Distribución",
  "Ventas",
  "Servicios a terceros",
  "Personal",
  "Control",
  "Sistemas",
  "Operaciones",
  "Intelix",
];
export const SEXOS = ["Femenino", "Masculino", "Otro"];
export const EDUC = ["Primaria", "Secundaria", "Técnico", "Universitario", "Posgrado"];
export const MOVILM = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M7 NN"];
export const MOVIMIENTO = ["Sin cambio", "Promoción", "Ascenso"];
export const PAISES = ["Venezuela", "Costa Rica", "El Salvador", "Guatemala", "Colombia"];
export const AREAS_CONOC = [
  "Seguridad y salud",
  "Liderazgo",
  "Técnico/Operativo",
  "Sistemas y tecnología",
  "Calidad y procesos",
  "Habilidades blandas",
  "Cumplimiento/Legal",
  "Idiomas",
];

/** Columnas que se editan como <input type="number"> (resto texto/fecha/select). */
export const NUM_COLS = [
  "dias",
  "nivel",
  "paso",
  "colaboradores",
  "horas",
  "participantes",
  "cantidad",
];

// ---------------------------------------------------------------------------
// PGROUPS — grupos de parámetros del mes (ParametrosMes), 1:1 con el index.
// Cada campo tiene su clave (`k`), etiqueta (`l`) y tipo (`t`): num | pct | date
// | text. El ParamGrid renderiza un input por campo y guarda vía server action.
// ---------------------------------------------------------------------------
export type ParamFieldType = "num" | "pct" | "date" | "text";

export interface ParamField {
  k: string;
  l: string;
  t: ParamFieldType;
}

export interface ParamGroup {
  key: string;
  title: string;
  note: string;
  fields: ParamField[];
}

export const PGROUPS: ParamGroup[] = [
  {
    key: "seleccion",
    title: "Reclutamiento y selección",
    note: "Datos de selección, vacantes, ofertas y bienestar del mes.",
    fields: [
      { k: "dias_habiles", l: "Días hábiles", t: "num" },
      { k: "prom_colab", l: "Promedio colaboradores", t: "num" },
      { k: "nuevos", l: "Nuevos ingresos", t: "num" },
      { k: "colab_vac", l: "Colaboradores con vacaciones", t: "num" },
      { k: "vac_dias", l: "Suma días de vacante", t: "num" },
      { k: "vac_cant", l: "Número de vacantes", t: "num" },
      { k: "vac_fecha", l: "Fecha de apertura de vacante", t: "date" },
      { k: "of_contactados", l: "Oferentes contactados", t: "num" },
      { k: "of_descartados", l: "Descartados por salario", t: "num" },
      { k: "of_realizadas", l: "Ofertas realizadas", t: "num" },
      { k: "of_rechazadas", l: "Ofertas rechazadas", t: "num" },
      { k: "rot_ini", l: "Colaboradores M4, M5 y M7 NN", t: "num" },
      { k: "rot_egr", l: "Egresados con movilidad", t: "num" },
      { k: "des_ing12", l: "Ingresos 12 meses", t: "num" },
      { k: "des_egr12", l: "Egresos menores a 1 año", t: "num" },
    ],
  },
  {
    key: "clima",
    title: "Satisfacción laboral (anual)",
    note: "Resultado de la Encuesta Anual de Satisfacción en escala ESL (0–5). Se registra una vez al año.",
    fields: [
      { k: "encuesta", l: "Satisfaccion laboral anual (escala ESL 0-5)", t: "num" },
    ],
  },
  {
    key: "ssl",
    title: "Seguridad y Salud Laboral",
    note: "Accidentes del mes y fecha del último accidente (para los días sin accidentes).",
    fields: [
      { k: "accidentes", l: "Accidentes laborales", t: "num" },
      { k: "colab_accid", l: "Colaboradores accidentados", t: "num" },
      { k: "fecha_ult_accidente", l: "Fecha ultimo accidente", t: "date" },
      { k: "accid_area", l: "Área del último accidente", t: "text" },
      { k: "merma_hurto", l: "Merma (hurtos reportados)", t: "num" },
      { k: "record_dias", l: "Récord de días sin accidentes", t: "num" },
    ],
  },
  {
    key: "servicios",
    title: "Servicios Generales",
    note: "Mantenimiento y órdenes de trabajo del mes.",
    fields: [
      { k: "mant_plan", l: "OT Período (cantidad)", t: "num" },
      { k: "mant_cierre", l: "Ordenes de trabajo cerradas (%)", t: "pct" },
      { k: "ot_dias", l: "Dias promedio para cierre de OT", t: "num" },
      { k: "mant_prev", l: "% Mantenimiento preventivo", t: "num" },
    ],
  },
  {
    key: "bienestar",
    title: "Plan Anual de Bienestar",
    note: "Cumplimiento de actividades del Plan Anual de Bienestar.",
    fields: [
      { k: "bien_plan", l: "Actividades planificadas", t: "num" },
      { k: "bien_ejec", l: "Actividades ejecutadas", t: "num" },
      { k: "bien_cumpl", l: "% cumplimiento", t: "pct" },
    ],
  },
  {
    key: "ruta",
    title: "Capacitación · Ruta OLO",
    note: "% de cumplimiento por tipo de capacitación.",
    fields: [
      { k: "ruta_basicas", l: "Certificaciones basicas (%)", t: "pct" },
      {
        k: "ruta_tecnicas",
        l: "Tecnicas montacargas apiladores transpaletas choferes (%)",
        t: "pct",
      },
      { k: "ruta_liderazgo", l: "Liderazgo programa coaching (%)", t: "pct" },
    ],
  },
];

/** Metadata de cada tarjeta por tipo (título + nota), portada del index. */
export interface CardMeta {
  kind: EntKind;
  title: string;
  note: string;
}

export const CARDS: CardMeta[] = [
  {
    kind: "activos",
    title: "Colaboradores activos",
    note: "Base de personal del ERP (una fila por colaborador). De aquí salen total, niveles, demografía, género, movilidad M1–M7, promociones/ascensos, sucesión, nuevos ingresos y el promedio del mes.",
  },
  {
    kind: "egresos",
    title: "Egresos del mes",
    note: "Una fila por salida (motivo, departamento y fechas). Alimenta rotación total, por motivo y departamento, rotación indeseada (columna movilidad) y deserción de 1er año.",
  },
  {
    kind: "ausencias",
    title: "Incapacidades, permisos y vacaciones",
    note: "Días por tipo (CCSS, INS, permiso, vacaciones). Necesario para el ausentismo — no está en la nómina.",
  },
  {
    kind: "capacitacion",
    title: "Capacitación",
    note: "Horas de formación por área de conocimiento y curso.",
  },
  {
    kind: "extras",
    title: "Horas extras",
    note: "Horas extras del mes por área. Se integran a la tabla Colaboradores por Área en la Vista Operativa.",
  },
  {
    kind: "terceros",
    title: "Terceros por país",
    note: 'Colaboradores terceros del mes por país (país y cantidad). Alimenta "Colaboradores terceros por país" en la Vista Operativa.',
  },
  {
    kind: "merma",
    title: "Merma",
    note: "Cantidad de merma del mes por área.",
  },
  {
    kind: "vacaciones",
    title: "Vacaciones",
    note: "Días de vacaciones por colaborador/área. Complementa el cálculo de ausentismo y vacaciones.",
  },
];

/** Columna numérica → etiqueta de encabezado con clase `.num`. */
export function colLabel(c: string): string {
  if (c === "id") return "ID / Cédula";
  return c.replace(/_/g, " ");
}

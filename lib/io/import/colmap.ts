// lib/io/import/colmap.ts
//
// COLMAP — mapa de campos (columnas) por tipo de plantilla.
// Portado LÍNEA POR LÍNEA desde out/index.html (fuente de verdad):
//
//   const COLMAP={activos:["id","pais","nombre","departamento","area","sexo","fecha_nacimiento","fecha_ingreso","nivel","nivel_educativo","carrera","movilidad","movimiento","tipo","paso","vac_disfrutadas","vac_pendientes"],
//     terceros:["pais","cantidad"],
//     extras:["id","pais","nombre","departamento","area","horas"],
//     merma:["pais","area","cantidad"],
//     egresos:["id","pais","nombre","departamento","motivo","fecha_ingreso","fecha_salida","movilidad","recomienda"],
//     vacaciones:["id","pais","nombre","departamento","area","dias"],
//     ausencias:["id","pais","nombre","departamento","tipo","dias"],
//     areas:["grupo","area","colaboradores"],
//     capacitacion:["pais","area_conocimiento","curso","horas","participantes"]};
//
// Incluye el campo "id" (cédula) que agregamos al inicio de activos/extras/
// egresos/vacaciones/ausencias. El orden de los campos define el orden de
// columnas de las plantillas y la posición esperada en parseRows.
//
// Módulo puro (sin DOM).

/** Tipo de plantilla reconocido por el importador. */
export type ColmapKind =
  | "activos"
  | "terceros"
  | "extras"
  | "merma"
  | "egresos"
  | "vacaciones"
  | "ausencias"
  | "areas"
  | "capacitacion";

export const COLMAP: Record<ColmapKind, string[]> = {
  activos: ["id", "pais", "nombre", "departamento", "area", "sexo", "fecha_nacimiento", "fecha_ingreso", "nivel", "nivel_educativo", "carrera", "movilidad", "movimiento", "tipo", "paso", "vac_disfrutadas", "vac_pendientes"],
  terceros: ["pais", "cantidad"],
  extras: ["id", "pais", "nombre", "departamento", "area", "horas"],
  merma: ["pais", "area", "cantidad"],
  egresos: ["id", "pais", "nombre", "departamento", "motivo", "fecha_ingreso", "fecha_salida", "movilidad", "recomienda"],
  vacaciones: ["id", "pais", "nombre", "departamento", "area", "dias"],
  ausencias: ["id", "pais", "nombre", "departamento", "tipo", "dias"],
  areas: ["grupo", "area", "colaboradores"],
  capacitacion: ["pais", "area_conocimiento", "curso", "horas", "participantes"],
};

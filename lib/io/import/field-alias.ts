// lib/io/import/field-alias.ts
//
// FIELD_ALIAS — alias de encabezados de columna reconocidos por el importador,
// por cada campo del sistema. Portado LÍNEA POR LÍNEA desde out/index.html
// (fuente de verdad). Incluye la entrada `id:[...]` (cedula/cédula/dni/
// documento/...) que agregamos para mapear la cédula como clave natural.
//
// También porta los resolvedores de índice de columna que viven junto al
// FIELD_ALIAS en el index.html:
//   - resolveIdx(head, field): busca la primera columna cuyo encabezado
//     normalizado coincide con alguno de los alias del campo.
//   - idxAnio(head): localiza la columna AÑO (anio/ano/year).
//   - idxMes(head): localiza la columna MES (mes/month).
//
// Los encabezados (`head`) que reciben estas funciones ya vienen normalizados
// con NA() (snake_case sin acentos) — ver normval.ts / parseRows.
//
// Módulo puro (sin DOM).

export const FIELD_ALIAS: Record<string, string[]> = {
  id: ["id", "cedula", "cédula", "dni", "documento", "identificacion", "identificación", "num_identificacion", "numero_identificacion", "no_cedula", "nro_cedula", "cedula_identidad", "documento_identidad", "doc_identidad", "ci", "nit", "dpi", "cui"],
  pais: ["pais", "country"],
  nombre: ["nombre", "colaborador", "empleado", "nombre_completo", "funcionario"],
  departamento: ["departamento", "depto", "dpto"],
  area: ["area", "seccion", "area_de_trabajo", "area_trabajo", "subarea", "sub_area", "area_funcional", "area_de_desempeno", "seccion_area", "puesto_area", "grupo_area", "area_operativa"],
  sexo: ["sexo", "genero"],
  fecha_nacimiento: ["fecha_nacimiento", "nacimiento", "fec_nac", "fecha_de_nacimiento", "f_nacimiento"],
  fecha_ingreso: ["fecha_ingreso", "ingreso", "fec_ingreso", "fecha_de_ingreso", "f_ingreso"],
  fecha_salida: ["fecha_salida", "salida", "fec_salida", "fecha_de_salida", "f_salida", "baja"],
  nivel: ["nivel", "niveles", "niveles_organizacionales", "nivel_organizacional"],
  nivel_educativo: ["nivel_educativo", "escolaridad", "educacion", "grado_academico"],
  carrera: ["carrera", "carreras", "especializacion", "area_especializacion", "area_de_especializacion", "especialidad", "profesion", "carrera_profesional", "nivel_educativo", "escolaridad"],
  movilidad: ["movilidad", "mov"],
  vac_disfrutadas: ["vac_disfrutadas", "vacaciones_disfrutadas", "dias_disfrutados", "vacaciones_mes", "disfrutadas", "dias_vacaciones_mes"],
  vac_pendientes: ["vac_pendientes", "vacaciones_pendientes", "saldo_vacaciones", "dias_por_disfrutar", "vacaciones_por_disfrutar", "vacaciones_acumuladas", "saldo", "dias_acumulados", "dias_pendientes"],
  recomienda: ["recomienda", "recomendacion", "recomienda_olo", "recomendaria", "recomienda_trabajar", "recomiendan_trabajar_en_olo", "recomiendan_trabajar", "recomiendan", "nps"],
  cantidad: ["cantidad", "merma", "hurtos", "cantidad_hurtos", "monto", "colaboradores", "personas", "numero", "num", "cantidad_terceros", "terceros", "cant", "total"],
  movimiento: ["movimiento", "promociones_ascensos", "promocion_ascenso", "promociones", "ascensos", "accion_movimiento", "tipo_movimiento"],
  tipo: ["tipo", "tipo_contrato", "contrato", "tipo_de_contrato", "tipo_ausencia", "tipo_incapacidad", "tipo_de_incapacidad", "tipo_de_ausencia", "clase"],
  paso: ["paso", "pasos", "pasos_salariales"],
  motivo: ["motivo", "causa", "causa_salida", "razon"],
  dias: ["dias", "cantidad_dias", "dias_incapacidad", "cant_dias", "dias_disfrutados", "dias_disfrutadas", "vacaciones_disfrutadas_al_mes", "vacaciones_disfrutadas", "disfrutadas_al_mes"],
  area_conocimiento: ["area_conocimiento", "area_de_conocimiento", "tema", "competencia", "tematica", "categoria", "area_formacion", "area_de_formacion", "tipo_capacitacion", "clasificacion"],
  curso: ["curso", "actividad", "nombre_curso", "capacitacion", "nombre_de_la_actividad", "nombre_actividad", "titulo_curso"],
  horas: ["horas", "horas_extra", "cantidad_horas", "hrs", "horas_capacitacion", "horas_de_capacitacion", "horas_curso", "total_horas", "horas_impartidas"],
  participantes: ["participantes", "cantidad", "asistentes", "num_participantes", "colaboradores", "num_colaboradores", "asistencia", "personas", "cantidad_participantes"],
};

/**
 * Devuelve el índice de la primera columna de `head` cuyo encabezado
 * (ya normalizado con NA) coincide con alguno de los alias de `field`.
 * Si el campo no está en FIELD_ALIAS, usa el propio nombre del campo.
 * Portado de:
 *   function resolveIdx(head,field){const al=FIELD_ALIAS[field]||[field];for(const a of al){const i=head.indexOf(a);if(i>=0)return i;}return -1;}
 */
export function resolveIdx(head: string[], field: string): number {
  const al = FIELD_ALIAS[field] || [field];
  for (const a of al) {
    const i = head.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Índice de la columna AÑO.
 * Portado de:
 *   function idxAnio(head){for(const a of ["anio","ano","year"]){const i=head.indexOf(a);if(i>=0)return i;}return -1;}
 */
export function idxAnio(head: string[]): number {
  for (const a of ["anio", "ano", "year"]) {
    const i = head.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Índice de la columna MES.
 * Portado de:
 *   function idxMes(head){for(const a of ["mes","month"]){const i=head.indexOf(a);if(i>=0)return i;}return -1;}
 */
export function idxMes(head: string[]): number {
  for (const a of ["mes", "month"]) {
    const i = head.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

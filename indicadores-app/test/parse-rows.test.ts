// test/parse-rows.test.ts
//
// Tests de ejemplo para lib/io/import/parse-rows.ts (tarea 16.3).
// Verifican, con matrices en memoria (sin archivo real):
//   - parseRows mapea columnas por ALIAS (resolveIdx/FIELD_ALIAS).
//   - respeta AÑO/MES para asignar la clave de mes (monthKeyFrom), incluyendo
//     el mes por nombre.
//   - fuerza / completa el país según la "carga por país" (rolPais/paisCarga).
//   - reporta el campo requerido faltante (Req 9.6).
//   - headRow detecta la fila de encabezado.

import { describe, it, expect } from "vitest";
import { parseRows, headRow, monthKeyFrom } from "../lib/io/import/parse-rows";

describe("headRow", () => {
  it("detecta la fila de encabezado por AÑO/colaborador", () => {
    const mat = [["Reporte"], [], ["AÑO", "MES", "ID"], [2026, 7, "1-1"]];
    expect(headRow(mat)).toBe(2);
  });
  it("devuelve 0 si no hay encabezado reconocible en las primeras filas", () => {
    expect(headRow([["x", "y"], [1, 2]])).toBe(0);
  });
});

describe("monthKeyFrom", () => {
  it("arma YYYY-MM desde año y mes numérico", () => {
    expect(monthKeyFrom(2026, 7)).toBe("2026-07");
  });
  it("acepta el mes por nombre (prefijo de 3 letras)", () => {
    expect(monthKeyFrom(2025, "Enero")).toBe("2025-01");
    expect(monthKeyFrom(2025, "dic")).toBe("2025-12");
  });
  it("devuelve null para entradas inválidas", () => {
    expect(monthKeyFrom("", 5)).toBeNull();
    expect(monthKeyFrom(2026, 13)).toBeNull();
  });
});

describe("parseRows — alias de columnas", () => {
  it("mapea encabezados por alias equivalentes del mismo campo", () => {
    // "cedula" → id, "empleado" → nombre, "depto" → departamento.
    const mat = [
      ["CEDULA", "EMPLEADO", "DEPTO", "FECHA_INGRESO"],
      ["1-2345-6789", "Juan Pérez", "Logística", "2020-03-01"],
    ];
    const res = parseRows("activos", mat, { mesActual: "2026-07", paisCarga: "Costa Rica" });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].o.id).toBe("1-2345-6789");
    expect(res.rows[0].o.nombre).toBe("Juan Pérez");
    expect(res.rows[0].o.fecha_ingreso).toBe("2020-03-01");
  });
});

describe("parseRows — AÑO/MES", () => {
  it("asigna la clave de mes desde AÑO/MES de cada fila", () => {
    const mat = [
      ["AÑO", "MES", "ID", "FECHA_SALIDA", "MOTIVO"],
      [2026, 3, "1-1", "2026-03-10", "Renuncia"],
      [2025, "Noviembre", "1-2", "2025-11-02", "Despido"],
    ];
    const res = parseRows("egresos", mat, { mesActual: "2026-07" });
    expect(res.rows.map((r) => r.key)).toEqual(["2026-03", "2025-11"]);
  });

  it("usa mesActual cuando no hay columnas AÑO/MES", () => {
    const mat = [
      ["ID", "FECHA_SALIDA", "MOTIVO"],
      ["1-1", "2026-07-10", "Renuncia"],
    ];
    const res = parseRows("egresos", mat, { mesActual: "2026-07" });
    expect(res.rows[0].key).toBe("2026-07");
  });
});

describe("parseRows — carga por país", () => {
  it("fuerza el país del usuario de país (no puede inyectar otro)", () => {
    const mat = [
      ["PAIS", "ID", "FECHA_INGRESO"],
      ["Venezuela", "1-1", "2020-01-01"],
    ];
    const res = parseRows("activos", mat, { mesActual: "2026-07", rolPais: "Costa Rica" });
    expect(res.rows[0].o.pais).toBe("Costa Rica");
  });

  it("completa con paisCarga cuando el usuario global no trae país", () => {
    const mat = [
      ["ID", "FECHA_INGRESO"],
      ["1-1", "2020-01-01"],
    ];
    const res = parseRows("activos", mat, { mesActual: "2026-07", paisCarga: "Costa Rica", rolPais: "__all__" });
    expect(res.rows[0].o.pais).toBe("Costa Rica");
  });
});

describe("parseRows — campo faltante (Req 9.6)", () => {
  it("reporta el campo requerido sin columna reconocible", () => {
    // egresos requiere id + fecha_salida; falta fecha_salida.
    const mat = [
      ["ID", "MOTIVO"],
      ["1-1", "Renuncia"],
    ];
    const res = parseRows("egresos", mat, { mesActual: "2026-07" });
    expect(res.faltantes).toContain("fecha_salida");
    expect(res.faltantes).not.toContain("id");
  });

  it("no reporta faltantes cuando todas las columnas requeridas están", () => {
    const mat = [
      ["ID", "FECHA_SALIDA"],
      ["1-1", "2026-07-01"],
    ];
    const res = parseRows("egresos", mat, { mesActual: "2026-07" });
    expect(res.faltantes).toEqual([]);
  });
});

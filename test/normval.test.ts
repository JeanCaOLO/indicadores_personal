// test/normval.test.ts
//
// Tests de ejemplo para la normalización del importador (lib/io/import/normval.ts).
// Verifican paridad de reglas clave con out/index.html: fecha serial de Excel,
// sexo M/F, movilidad Mx, y limpieza de cédula (incluida notación científica).

import { describe, it, expect } from "vitest";
import { normVal, NA, toISODate, eduCarrera } from "../lib/io/import/normval";

describe("normVal — fechas", () => {
  it("convierte un serial de Excel a ISO", () => {
    // 45658 = 2025-01-01 (base 1899-12-30).
    expect(normVal("fecha_ingreso", 45658)).toBe("2025-01-01");
  });

  it("acepta dd/mm/yyyy y lo reordena a ISO", () => {
    expect(normVal("fecha_salida", "15/06/2026")).toBe("2026-06-15");
  });

  it("deja pasar un ISO ya formado (recortado a 10)", () => {
    expect(normVal("fecha_nacimiento", "1990-05-14T00:00:00")).toBe("1990-05-14");
  });
});

describe("normVal — sexo", () => {
  it("normaliza 'M' a Masculino", () => {
    expect(normVal("sexo", "M")).toBe("Masculino");
  });
  it("normaliza 'f' y 'mujer' a Femenino", () => {
    expect(normVal("sexo", "f")).toBe("Femenino");
    expect(normVal("sexo", "Mujer")).toBe("Femenino");
  });
});

describe("normVal — movilidad", () => {
  it("normaliza 'm5' a M5", () => {
    expect(normVal("movilidad", "m5")).toBe("M5");
  });
  it("mapea NN a M7 NN", () => {
    expect(normVal("movilidad", "NN")).toBe("M7 NN");
  });
});

describe("normVal — id (cédula)", () => {
  it("elimina puntos y espacios", () => {
    expect(normVal("id", " 1.234.567 ")).toBe("1234567");
  });
  it("expande notación científica", () => {
    expect(normVal("id", "1.23456789E8")).toBe("123456789");
  });
});

describe("normVal — nivel educativo", () => {
  it("clasifica una maestría como Posgrado", () => {
    expect(normVal("nivel_educativo", "Maestría en Administración")).toBe("Posgrado");
  });
});

describe("helpers", () => {
  it("NA normaliza encabezados a snake_case sin acentos", () => {
    expect(NA("Fecha de Ingreso")).toBe("fecha_de_ingreso");
  });
  it("toISODate maneja serial de Excel", () => {
    expect(toISODate(45658)).toBe("2025-01-01");
  });
  it("eduCarrera extrae la carrera tras 'en'", () => {
    expect(eduCarrera("Licenciatura en Ingeniería")).toBe("Ingeniería");
  });
});

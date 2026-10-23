// =============================================================================
// components/FilterBar.tsx
//
// Barra de filtros (tarea 12.3). Paridad visual 1:1 con el bloque `.filters`
// del Sistema_Actual (out/index.html):
//
//   <div class="filters" id="filterBar">
//     <div class="filters-inner">
//       <div class="fgroup primary"><label>País</label><select id="fPais"></select></div>
//       <div class="fgroup primary"><label>Mes</label><select id="fMonth"></select></div>
//       <div class="fgroup"><label>Año</label><select id="fYear"></select></div>
//       <div class="fgroup"><label>Vista</label><select id="fView"></select></div>
//       <div class="fgroup" id="gYear2"><label>Comparar con</label><select id="fYear2"></select></div>
//       <div class="fgroup"><label>Área responsable</label><select id="fArea"></select></div>
//       <div class="fspacer" id="fInfo"></div>
//     </div>
//   </div>
//
// ENFOQUE DE ESTADO (documentado en la tarea):
//   El Sistema_Actual guardaba los filtros en variables globales (PAIS, CUR,
//   YEAR, VIEW, YEAR2, AREA) y recomputaba el dashboard en memoria al cambiar
//   cualquiera. Acá, como las vistas son RUTAS (Server Components), la
//   FilterBar es un client component que SINCRONIZA los filtros a la URL como
//   query params:
//
//     ?pais=<país|__all__>&mes=YYYY-MM&anio=YYYY&view=<mes|acum|comp>
//      &anio2=YYYY&area=<área|__all__>
//
//   Las páginas (tarea 14) leen esos `searchParams` en el servidor y calculan.
//   Así el estado de filtros vive en la URL (compartible, con back/forward) en
//   vez de en memoria del cliente.
//
// SCOPE (Req 5.5):
//   - scope 'pais'   → el selector de País queda FIJADO a su país y
//                      DESHABILITADO (no puede ver otros países).
//   - scope 'global' → ve todos los países (incluye "Consolidado").
//   - scope 'admin'  → no ve data; el layout no renderiza la FilterBar para
//                      admin, así que este componente asume scope con data.
//
// Los valores de los selects (lista de países, meses, años, áreas) replican los
// del sistema actual.
//
// _Requirements: 16.3, 5.5_
// =============================================================================

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { PaisScope } from "../core/types";

// Listas idénticas al Sistema_Actual (out/index.html).
const PAISES = [
  "Venezuela",
  "Costa Rica",
  "El Salvador",
  "Guatemala",
  "Colombia",
] as const;

const AREAS_RESP = [
  "Personal",
  "Seguridad y Salud Laboral",
  "Servicios Generales",
] as const;

const MLONG = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

// Años base del sistema actual (YEARS=[2024,2025,2026,2027]). El año por
// defecto en el sistema actual es 2026.
const YEARS = [2024, 2025, 2026, 2027] as const;
const DEFAULT_YEAR = 2026;

const VIEWS = [
  { value: "mes", label: "Mes" },
  { value: "acum", label: "Acumulado (YTD)" },
  { value: "comp", label: "Comparativa anual" },
] as const;

export interface FilterBarProps {
  /**
   * Filtro de país resuelto por RBAC:
   *   - "__all__" → scope global (País libre, incluye Consolidado).
   *   - un país   → scope pais (País fijado y deshabilitado, Req 5.5).
   */
  paisScope: PaisScope;
}

/** `${y}-${MM}` para m en 1..12. */
function monthsOf(year: number): string[] {
  return Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
  );
}

export function FilterBar({ paisScope }: FilterBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // scope 'pais' → País fijado al país del usuario.
  const paisFijado = paisScope !== "__all__";

  // Valores actuales (leídos de la URL, con defaults equivalentes al sistema).
  const year = Number(searchParams.get("anio")) || DEFAULT_YEAR;
  const months = monthsOf(year);
  const mes = searchParams.get("mes") ?? `${year}-07`; // CUR="2026-07" por defecto
  const view = searchParams.get("view") ?? "mes";
  const year2 = Number(searchParams.get("anio2")) || year - 1;
  const area = searchParams.get("area") ?? "__all__";
  const pais = paisFijado ? paisScope : (searchParams.get("pais") ?? "__all__");

  /** Actualiza un conjunto de query params preservando el resto. */
  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) params.set(k, v);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="filters" id="filterBar">
      <div className="filters-inner">
        <div className="fgroup primary">
          <label>País</label>
          <select
            id="fPais"
            value={pais}
            disabled={paisFijado}
            title={paisFijado ? `Acceso fijado a ${paisScope}` : undefined}
            onChange={(e) => update({ pais: e.target.value })}
          >
            <option value="__all__">Consolidado (todos los países)</option>
            {PAISES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="fgroup primary">
          <label>Mes</label>
          <select
            id="fMonth"
            value={mes}
            onChange={(e) => update({ mes: e.target.value })}
          >
            {months.map((k) => {
              const idx = Number(k.slice(5, 7)) - 1;
              return (
                <option key={k} value={k}>
                  {MLONG[idx]} {year}
                </option>
              );
            })}
          </select>
        </div>

        <div className="fgroup">
          <label>Año</label>
          <select
            id="fYear"
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              // Al cambiar de año, re-ancla el mes al mismo número de mes del
              // nuevo año (igual que CUR=`${YEAR}-${CUR.slice(5,7)}`).
              update({ anio: String(y), mes: `${y}-${mes.slice(5, 7)}` });
            }}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="fgroup">
          <label>Vista</label>
          <select
            id="fView"
            value={view}
            onChange={(e) => update({ view: e.target.value })}
          >
            {VIEWS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div
          className="fgroup"
          id="gYear2"
          style={{ display: view === "comp" ? "" : "none" }}
        >
          <label>Comparar con</label>
          <select
            id="fYear2"
            value={year2}
            onChange={(e) => update({ anio2: e.target.value })}
          >
            {YEARS.filter((y) => y !== year).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="fgroup">
          <label>Área responsable</label>
          <select
            id="fArea"
            value={area}
            onChange={(e) => update({ area: e.target.value })}
          >
            <option value="__all__">Todas las áreas</option>
            {AREAS_RESP.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="fspacer" id="fInfo"></div>
      </div>
    </div>
  );
}

export default FilterBar;

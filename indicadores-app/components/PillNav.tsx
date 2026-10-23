// =============================================================================
// components/PillNav.tsx
//
// Navegación por "pills" (tarea 12.3). Paridad visual 1:1 con el bloque
// `.pillnav` del Sistema_Actual (out/index.html, builder de `pillarNav`):
//
//   <div class="pillnav">
//     <div class="pill-row"> <button class="pill [active]">…</button> … </div>
//     <div class="dseg-row">
//       <span class="dseg-wrap">
//         <button class="dseg [active]" data-dens="det">Detalle</button>
//         <button class="dseg [active]" data-dens="res">Resumen</button>
//       </span>
//     </div>
//   </div>
//
// Diferencia arquitectónica respecto del sistema actual:
//   - El Sistema_Actual era una SPA: los pills hacían scroll a secciones del
//     mismo documento (`data-target`) y el `active` se marcaba por click.
//   - Acá las 5 vistas son RUTAS del App Router (dashboard, administrar,
//     corporativa, comparativa, usuarios). Entonces cada pill es un <Link> a su
//     ruta y el `active` se resuelve por `usePathname()` (la ruta activa manda,
//     no el último click). Por eso es un client component ("use client").
//
// El segmento de densidad (.dseg "Detalle"/"Resumen") era estado de UI del
// dashboard (DENS="det"|"res"). En la migración por rutas, la densidad vive
// dentro del dashboard; acá se renderiza el markup/clases idénticos y se
// sincroniza a la URL vía ?dens=det|res para que la página del dashboard lo
// lea (mismo enfoque de query-params que FilterBar). El segmento solo aparece
// en la vista dashboard (igual que en el sistema actual, donde solo aplicaba al
// `v-dash`).
//
// _Requirements: 16.3_
// =============================================================================

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface PillItem {
  /** Ruta destino, p. ej. "/dashboard". */
  href: string;
  /** Etiqueta corta mostrada en el pill. */
  label: string;
  /** Título accesible (tooltip) del pill. */
  title: string;
}

export interface PillNavProps {
  /** Pills a renderizar (ya filtrados por scope desde el layout). */
  items: PillItem[];
}

/** Ruta donde aplica el segmento de densidad (solo el dashboard). */
const DENSITY_ROUTE = "/dashboard";

/** Densidades válidas del dashboard (idénticas al sistema actual). */
const DENSITIES = [
  { value: "det", label: "Detalle" },
  { value: "res", label: "Resumen" },
] as const;

export function PillNav({ items }: PillNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // El segmento de densidad solo aplica al dashboard (como en el sistema
  // actual, donde DENS solo afectaba al `v-dash`).
  const showDensity =
    pathname === DENSITY_ROUTE || pathname.startsWith(`${DENSITY_ROUTE}/`);

  // Densidad activa leída de la URL (?dens=…); por defecto "det" como el
  // DENS="det" inicial del sistema actual.
  const dens = searchParams.get("dens") === "res" ? "res" : "det";

  function setDensity(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("dens", value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="pillnav" id="pillarNav">
      <div className="pill-row">
        {items.map((it) => {
          // Un pill está activo si la ruta actual coincide o cuelga de su href.
          const active =
            pathname === it.href || pathname.startsWith(`${it.href}/`);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`pill${active ? " active" : ""}`}
              title={it.title}
            >
              {it.label}
            </Link>
          );
        })}
      </div>

      {showDensity && (
        <div className="dseg-row">
          <span className="dseg-wrap">
            {DENSITIES.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`dseg${dens === d.value ? " active" : ""}`}
                data-dens={d.value}
                onClick={() => setDensity(d.value)}
              >
                {d.label}
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

export default PillNav;

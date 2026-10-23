// =============================================================================
// components/HeaderActions.tsx  (tarea 18.1 — cableado de export del Header)
//
// CLIENT COMPONENT ("use client") que renderiza y CABLEA los botones de
// exportación del Header: "⬇ Excel mes", "⬇ Excel año" y "⬇ PDF".
//
// -----------------------------------------------------------------------------
// POR QUÉ UN CLIENT COMPONENT AQUÍ
// -----------------------------------------------------------------------------
// El Header es un SERVER COMPONENT (markup estático + chip de usuario). Las
// funciones de export (`lib/io/export/xlsx` y `pdf`) son CLIENT-SIDE: cargan
// `xlsx`/`jspdf` con dynamic import y disparan la descarga vía Blob/`document`,
// así que no pueden ejecutarse en el servidor. Este componente embebido en el
// Header es la parte interactiva que las invoca en el navegador.
//
// -----------------------------------------------------------------------------
// DE DÓNDE SALEN LOS DATOS (decisión — opción b del enunciado)
// -----------------------------------------------------------------------------
// Para computar los indicadores a exportar hace falta el `db: ConfigDB`. En vez
// de duplicar el db en el cliente (que solo el dashboard tiene en memoria), al
// hacer click se llama a la SERVER ACTION `getDbForExport(year)` que hace
// `loadDB(year)` respetando RLS y devuelve el `ConfigDB`. Luego se corre la
// exportación en memoria. Así los botones funcionan desde el header en
// cualquier vista de data (hoy, dashboard).
//
// Los FILTROS (mes/año/país/área/depto) se leen de la URL (los pone la
// FilterBar), igual que el sistema actual exportaba el estado del filtro
// vigente. El PAÍS efectivo respeta el scope: si `paisScope` es un país
// concreto (scope 'pais'), se usa ese país y se ignora el de la URL (Req 5.5).
//
// -----------------------------------------------------------------------------
// VISIBILIDAD POR VISTA (paridad con out/index.html: applyViewVisibility)
// -----------------------------------------------------------------------------
// En el sistema actual los botones de Excel mes/año y el PDF operativo solo se
// mostraban en el Dashboard (xlsMesBtn/xlsAnioBtn con `display` controlado por
// la vista; printBtn cambiaba de destino según la vista). Replicamos eso: estos
// botones del header SOLO se renderizan en `/dashboard`. En `/corporativa` la
// exportación a PDF la provee el botón propio de esa vista (CorporativaClient),
// que llama a `downloadPDFCorporativa`. En el resto de vistas no hay export en
// el header (igual que el sistema actual, que los ocultaba fuera del dash).
// =============================================================================

"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { ComputeContext, ConfigDB, MonthKey, PaisScope } from "../core/types";
import { getDbForExport } from "../app/(app)/export-actions";

/** Año por defecto (igual que la FilterBar / sistema actual: 2026). */
const DEFAULT_YEAR = 2026;

export interface HeaderActionsProps {
  /**
   * Filtro de país del usuario (RBAC): "__all__" (global, país libre) o un país
   * concreto (scope 'pais', país fijado). Se usa para forzar el país del export
   * cuando el scope es de país (Req 5.5).
   */
  paisScope: PaisScope;
}

/** Lee los filtros de export de la URL, resolviendo defaults como la FilterBar. */
function useExportFilters(paisScope: PaisScope) {
  const sp = useSearchParams();
  const year = Number(sp.get("anio")) || DEFAULT_YEAR;
  const mes = (sp.get("mes") ?? `${year}-07`) as MonthKey;
  const dep = sp.get("dep") ?? "__all__";
  const area = sp.get("area") ?? "__all__";
  // scope 'pais' → país fijado (ignora el de la URL). global → el de la URL.
  const paisFijado = paisScope !== "__all__";
  const pais = paisFijado ? (paisScope as string) : (sp.get("pais") ?? "__all__");
  return { year, mes, dep, area, pais };
}

export default function HeaderActions({ paisScope }: HeaderActionsProps) {
  const pathname = usePathname();
  const { year, mes, dep, area, pais } = useExportFilters(paisScope);
  const [busy, setBusy] = useState<null | "mes" | "anio" | "pdf">(null);

  // Visibilidad por vista: Excel/PDF operativo solo en el Dashboard (paridad).
  const esDashboard = pathname === "/dashboard";
  if (!esDashboard) return null;

  /** Arma el ComputeContext del export (mismo que usa el dashboard). */
  const ctxFor = (): ComputeContext => ({
    pais,
    dep,
    area,
    today: new Date(),
    dashYear: year,
  });

  /** Ejecuta un export protegido con estado `busy` y manejo de error. */
  const run = async (
    which: "mes" | "anio" | "pdf",
    fn: (db: ConfigDB) => Promise<unknown>,
  ) => {
    if (busy) return;
    setBusy(which);
    try {
      const db = await getDbForExport(year);
      await fn(db);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo exportar.";
      // Feedback simple (el sistema actual usaba su propio toast).
      alert(msg);
    } finally {
      setBusy(null);
    }
  };

  const onExcelMes = () =>
    run("mes", async (db) => {
      const { exportOperativaMes } = await import("../lib/io/export/xlsx");
      await exportOperativaMes({ db, mes, ctx: ctxFor() });
    });

  const onExcelAnio = () =>
    run("anio", async (db) => {
      const { exportOperativaAnio } = await import("../lib/io/export/xlsx");
      await exportOperativaAnio({ db, year, ctx: ctxFor() });
    });

  const onPdf = () =>
    run("pdf", async (db) => {
      const { downloadPDFOperativa } = await import("../lib/io/export/pdf");
      await downloadPDFOperativa({ db, mes, pais, ctx: ctxFor() });
    });

  return (
    <>
      <button
        className="hbtn"
        type="button"
        title="Descargar los indicadores del mes en Excel"
        disabled={busy !== null}
        onClick={onExcelMes}
      >
        {busy === "mes" ? "… Excel mes" : "⬇ Excel mes"}
      </button>
      <button
        className="hbtn"
        type="button"
        title="Descargar los indicadores del año (12 meses) en Excel"
        disabled={busy !== null}
        onClick={onExcelAnio}
      >
        {busy === "anio" ? "… Excel año" : "⬇ Excel año"}
      </button>
      <button
        className="hbtn"
        type="button"
        title="Descargar el PDF de la vista operativa"
        disabled={busy !== null}
        onClick={onPdf}
      >
        {busy === "pdf" ? "… PDF" : "⬇ PDF"}
      </button>
    </>
  );
}

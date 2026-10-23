// =============================================================================
// app/(app)/export-actions.ts
//
// SERVER ACTIONS de EXPORTACIÓN (tarea 18.1 — cableado de los botones del
// Header). Corren SIEMPRE en el servidor ("use server"), nunca en el bundle de
// cliente ni durante el build.
//
// -----------------------------------------------------------------------------
// POR QUÉ ESTA ACTION (decisión de cableado — opción b del enunciado 18.1)
// -----------------------------------------------------------------------------
// Los botones de export ("⬇ Excel mes", "⬇ Excel año", "⬇ PDF") viven en el
// HEADER (igual que el sistema actual `out/index.html`, donde xlsMesBtn/
// xlsAnioBtn/printBtn están en `header.app .hactions`). El Header es un SERVER
// COMPONENT, pero las funciones de export (`lib/io/export/xlsx` y `pdf`) son
// CLIENT-SIDE: arman el workbook/PDF con dynamic import de `xlsx`/`jspdf` y
// disparan la descarga vía Blob/`document`. Por eso el cableado real vive en un
// CLIENT COMPONENT (`components/HeaderActions.tsx`).
//
// El problema: `exportOperativaMes({ db, mes, ctx })` y sus pares necesitan el
// `db: ConfigDB` para COMPUTAR, y ese `db` solo existe cargado en el servidor
// (vía `loadDB`, que respeta RLS por país). Para que los botones del header
// funcionen desde CUALQUIER vista (no solo /dashboard, donde el db ya está en
// memoria del cliente), `HeaderActions` llama a esta server action
// `getDbForExport(year)`, que hace `loadDB(year)` con la sesión del usuario
// (RLS aplica el filtro de país en la base) y devuelve el `ConfigDB` plano
// serializable. Luego el cliente corre la exportación en memoria.
//
// SEGURIDAD / RLS:
//   · `requireAuth()` exige sesión (si no hay, redirige a /login).
//   · Un `scope === 'admin'` NO ve data (igual que el layout, que le oculta los
//     botones): la action lanza para ese scope. Solo global/pais obtienen db.
//   · `loadDB` usa el server client con RLS: el usuario de país solo recibe su
//     país; global, todos. No se usa el admin client (eso saltearía RLS).
//
// El cliente decide el PAÍS efectivo del export vía `ctx.pais` (que arma a
// partir de la URL y del scope); la action solo provee el `db` del año. Esto
// replica el sistema actual, donde el export usaba el PAIS del filtro vigente
// sobre el DB ya cargado.
// =============================================================================

"use server";

import type { ConfigDB } from "../../core/types";
import { requireAuth } from "../../lib/auth/session";
import { loadDB } from "../../lib/data/queries";

/**
 * Carga el `ConfigDB` del año `year` para exportar (Excel/PDF) desde el Header.
 *
 * Respeta RLS (el usuario de país solo recibe su país). Lanza si el scope es
 * 'admin' (no ve data). Devuelve el `ConfigDB` plano (serializable para cruzar
 * la frontera server→client de la Server Action).
 *
 * @param year Año del dashboard/export.
 */
export async function getDbForExport(year: number): Promise<ConfigDB> {
  const ctx = await requireAuth();
  if (ctx.scope === "admin") {
    // Admin no ve data (paridad con `applySessionAccess` del sistema actual).
    throw new Error("Tu rol no tiene acceso a los datos para exportar.");
  }
  return loadDB(year);
}

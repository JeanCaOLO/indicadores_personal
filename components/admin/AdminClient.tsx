// =============================================================================
// components/admin/AdminClient.tsx  (tarea 16.5)
//
// CLIENT COMPONENT raíz de la Pantalla Administrar. Porta `renderAdmin` del
// sistema actual (out/index.html) con paridad de markup/clases:
//
//   1. Encabezado (`.adm-head`) + caja de ayuda (`.autobox`) + selector de
//      período (`.period`): mes / año / país. Cambiar el período navega por URL
//      (searchParams), de modo que el SERVER COMPONENT recarga los registros del
//      mes elegido (RLS). El país queda FIJO/deshabilitado si el scope es 'pais'.
//
//   2. Asistente de carga del mes (CargaWizard): 3 pasos (descargar plantilla,
//      completar, soltar archivo) con drop-area que acepta .xlsx/.xls y, al
//      soltar, llama la SERVER ACTION `subirMaestra` (readMasterWorkbook +
//      ingestMaster en el servidor). Muestra el estado por país (✅/⏳).
//
//   3. Carga maestra (MasterUpload): descargar plantilla maestra (17.1) + subir
//      (server action `subirMaestra`) + limpiar meses vacíos (`limpiarMesesVacios`).
//
//   4. Tarjetas por tipo (DataCard): activos, egresos, ausencias, vacaciones,
//      extras, terceros, merma, capacitacion. Cada una: estado (✓ N registros /
//      sin cargar), descargar plantilla del tipo (17.1), subir Excel/CSV (server
//      action `subirTipo`) y detalle expandible (`.dc-edit`) con la tabla
//      editable (EditableTable: editar/eliminar/agregar fila + guardar).
//
//   5. ParamGrid: edición de ParametrosMes por grupo/área con guardar
//      (`guardarParametros`).
//
// Las SERVER ACTIONS reciben el archivo como FormData (File); el país efectivo y
// el scope los fuerza la propia action (Req 6.5). Tras una carga/guardado se
// llama `router.refresh()` para recargar los registros desde el servidor.
// =============================================================================

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";

import type { ParametrosMes } from "../../core/types";
import { MLONG } from "../../core/kpi-defs";
import {
  guardarParametros,
  guardarRegistros,
  limpiarMesesVacios,
  subirMaestra,
  subirTipo,
  type AdminResult,
} from "../../app/(app)/administrar/actions";
import type { MonthKey } from "../../core/types";
import type { EntityKind } from "../../lib/data/writes";
import { CARDS, COLMAP, PAISES, type EntKind } from "./admin-constants";
import EditableTable from "./EditableTable";
import ParamGrid from "./ParamGrid";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Registros editables por tipo (campo→string), armados por el server component. */
export type AdminRegistros = Record<EntKind, Record<string, string>[]>;

export interface AdminClientProps {
  mes: string;
  year: number;
  pais: string;
  /** scope 'pais' → el país queda fijado (no lo cambia el usuario). */
  paisFijado: boolean;
  registros: AdminRegistros;
  params: ParametrosMes;
}

/** Años seleccionables (mismo rango que la FilterBar del proyecto). */
const YEARS = [2024, 2025, 2026];

// ---------------------------------------------------------------------------
// Descarga de plantillas (tarea 17.1 — `lib/io/export/xlsx`).
//
// `masterTemplate({ mes })` y `dlTpl(kind, { mes })` son CLIENT-SIDE: arman el
// workbook y disparan la descarga vía Blob/`document`. Se cargan con DYNAMIC
// IMPORT para no inflar el bundle y para no romper el build si 17.1 aún no
// estuviera integrada (try/catch avisa al usuario). Al integrarse 17.1, los
// botones quedan funcionales sin tocar más código.
// ---------------------------------------------------------------------------
type ExportXlsx = {
  masterTemplate?: (args: { mes: MonthKey }) => Promise<boolean>;
  dlTpl?: (kind: string, args: { mes: MonthKey }) => Promise<boolean>;
};

async function loadExportXlsx(): Promise<ExportXlsx | null> {
  try {
    return (await import("../../lib/io/export/xlsx")) as ExportXlsx;
  } catch {
    return null;
  }
}

async function descargarPlantillaMaestra(mes: string): Promise<void> {
  const mod = await loadExportXlsx();
  if (!mod?.masterTemplate) {
    alert(
      "La descarga de la plantilla maestra se habilita al integrar la exportación a Excel (tarea 17.1).",
    );
    return;
  }
  await mod.masterTemplate({ mes: mes as MonthKey });
}

async function descargarPlantillaTipo(kind: string, mes: string): Promise<void> {
  const mod = await loadExportXlsx();
  if (!mod?.dlTpl) {
    alert(
      "La descarga de plantillas se habilita al integrar la exportación a Excel (tarea 17.1).",
    );
    return;
  }
  const ok = await mod.dlTpl(kind, { mes: mes as MonthKey });
  if (!ok) {
    alert(`No hay plantilla disponible para "${kind}".`);
  }
}

// ===========================================================================
// DataCard — tarjeta por tipo (estado + plantilla + subir + editar)
// ===========================================================================

function DataCard({
  kind,
  title,
  note,
  rows,
  mes,
  pais,
  busy,
  onToast,
  onReload,
}: {
  kind: EntKind;
  title: string;
  note: string;
  rows: Record<string, string>[];
  mes: string;
  pais: string;
  busy: boolean;
  onToast: (r: AdminResult) => void;
  onReload: () => void;
}) {
  const cols = COLMAP[kind];
  // Registros visibles según el país seleccionado (paridad con dataCard).
  const visibles =
    pais === "__all__" ? rows : rows.filter((r) => (r.pais ?? "") === pais);
  const n = visibles.length;

  const subir = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await subirTipo(kind as ColmapKindish, mes, pais, fd);
    onToast(res);
    if (res.ok) onReload();
  };

  const guardar = async (filas: Record<string, string>[]) => {
    const res = await guardarRegistros(kind as EntityKind, mes, pais, filas);
    onToast(res);
    if (res.ok) onReload();
  };

  const plantilla = () => descargarPlantillaTipo(kind, mes);

  return (
    <div className="up-card">
      <div className="up-head">
        <div className="up-ttl">
          <h3>{title}</h3>
          <p className="up-note">{note}</p>
        </div>
        <span className={`up-status ${n ? "on" : ""}`}>
          {n
            ? `✓ ${n} registro${n === 1 ? "" : "s"}${pais !== "__all__" ? " · " + pais : ""}`
            : "sin cargar"}
        </span>
      </div>
      <div className="up-actions">
        <button className="mini" disabled={busy} onClick={plantilla}>
          ↓ Plantilla
        </button>
        <label className="mini solid" style={{ cursor: "pointer" }}>
          ⤒ Subir Excel/CSV
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {n ? (
        <details className="dc-edit">
          <summary>
            Ver / editar registros ({n}) <span className="fchev">▾</span>
          </summary>
          <EditableTable
            kind={kind}
            cols={cols}
            rows={visibles}
            onSave={guardar}
            busy={busy}
          />
        </details>
      ) : (
        <div className="up-empty">
          Sin registros{pais !== "__all__" ? " para " + pais : ""}. Subí el
          archivo o agregá filas manualmente desde el detalle tras una carga.
        </div>
      )}
    </div>
  );
}

/** `kind` como ColmapKind (todas las EntKind son ColmapKind con país). */
type ColmapKindish = Parameters<typeof subirTipo>[0];

// ===========================================================================
// CargaWizard — asistente de carga del mes (3 pasos + drop-area)
// ===========================================================================

function CargaWizard({
  curLbl,
  paisLbl,
  paisesEst,
  cargadoPorPais,
  busy,
  onPlantilla,
  onFile,
}: {
  curLbl: string;
  paisLbl: string;
  paisesEst: string[];
  cargadoPorPais: (p: string) => boolean;
  busy: boolean;
  onPlantilla: () => void;
  onFile: (f: File) => void;
}) {
  const [over, setOver] = useState(false);
  const badge: React.CSSProperties = {
    display: "inline-flex",
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--teal)",
    color: "#fff",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 12,
    marginRight: 8,
    flex: "none",
  };

  const onDrop = (ev: DragEvent<HTMLLabelElement>) => {
    ev.preventDefault();
    setOver(false);
    const f = ev.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <>
      <div className="adm-sec">
        <span className="adm-step">▶</span>
        <span className="adm-sec-t">Asistente de carga del mes</span>
        <span className="adm-fold-h" style={{ marginLeft: 8 }}>
          la forma más simple de cargar
        </span>
      </div>
      <div className="up-card" style={{ borderLeft: "4px solid var(--teal)" }}>
        <div className="up-head">
          <div className="up-ttl">
            <h3>Cargar datos del mes</h3>
            <p className="up-note">
              País: <b>{paisLbl}</b> · Período: <b>{curLbl}</b>. Tres pasos:
              descargá la plantilla (ya trae país y mes), completala en Excel y
              soltala aquí. El sistema valida y actualiza el tablero. Cambiás el
              período arriba, en el selector de mes/año.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={badge}>1</span>
            <span style={{ fontSize: 14 }}>Descargá la plantilla del mes</span>
            <button className="mini solid" disabled={busy} onClick={onPlantilla}>
              ↓ Plantilla
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={badge}>2</span>
            <span style={{ fontSize: 14 }}>
              Completala en Excel (país y mes ya vienen puestos)
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={badge}>3</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                Soltá el archivo completado aquí:
              </div>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
                style={{
                  display: "block",
                  border: `2px dashed ${over ? "var(--teal)" : "#bcbcbc"}`,
                  background: over ? "#eef9f5" : undefined,
                  borderRadius: 10,
                  padding: "26px 16px",
                  textAlign: "center",
                  color: "#666",
                  cursor: "pointer",
                  transition: ".15s",
                  fontSize: 14,
                }}
              >
                📄 Arrastrá y soltá el Excel aquí, o <u>hacé clic para elegir</u>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #eee" }}>
          <b style={{ fontSize: 13 }}>Estado de {curLbl}:</b>{" "}
          <span style={{ fontSize: 13 }}>
            {paisesEst.map((pp, i) => (
              <span key={pp}>
                {i > 0 && <>&nbsp;&nbsp;·&nbsp;&nbsp;</>}
                {pp} {cargadoPorPais(pp) ? "✅" : "⏳"}
              </span>
            ))}
          </span>
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// AdminClient — raíz
// ===========================================================================

export default function AdminClient({
  mes,
  year,
  pais,
  paisFijado,
  registros,
  params,
}: AdminClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const busy = pending || running;

  const monthIdx = +mes.slice(5, 7) - 1;
  const curLbl = `${MLONG[monthIdx]} ${mes.slice(0, 4)}`;

  // Navegación por URL al cambiar período (el server component recarga el mes).
  const navegar = (next: { mes?: string; anio?: number; pais?: string }) => {
    const p = new URLSearchParams();
    p.set("mes", next.mes ?? mes);
    p.set("anio", String(next.anio ?? year));
    if (!paisFijado) p.set("pais", next.pais ?? pais);
    startTransition(() => router.push(`/administrar?${p.toString()}`));
  };

  const onMonth = (idx: number) =>
    navegar({ mes: `${year}-${String(idx + 1).padStart(2, "0")}` });
  const onYear = (y: number) =>
    navegar({ anio: y, mes: `${y}-${String(monthIdx + 1).padStart(2, "0")}` });
  const onPais = (p: string) => navegar({ pais: p });

  // Toast simple (alert). El sistema actual usa su propio toast; aquí basta un
  // feedback claro del resultado de la acción.
  const toast = (r: AdminResult) => {
    const extra =
      r.detalle?.faltantes && r.detalle.faltantes.length
        ? "\n\nCampos faltantes: " +
          r.detalle.faltantes
            .map((f) => `${f.kind}: ${f.campos.join(", ")}`)
            .join(" · ")
        : "";
    alert(r.message + extra);
  };

  const reload = () => startTransition(() => router.refresh());

  const withRunning = async (fn: () => Promise<void>) => {
    setRunning(true);
    try {
      await fn();
    } finally {
      setRunning(false);
    }
  };

  // --- Carga maestra (wizard + master upload) ---
  const subirMaestraFile = (file: File) =>
    withRunning(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await subirMaestra(mes, pais, fd);
      toast(res);
      if (res.ok) reload();
    });

  const plantillaMaestra = () =>
    withRunning(async () => descargarPlantillaMaestra(mes));

  const limpiar = () =>
    withRunning(async () => {
      const res = await limpiarMesesVacios();
      toast(res);
      if (res.ok) reload();
    });

  // --- ParamGrid ---
  const onSaveParams = (p: ParametrosMes) =>
    withRunning(async () => {
      const res = await guardarParametros(mes, pais, p);
      toast(res);
      if (res.ok) reload();
    });

  // Estado de carga por país (CargaWizard): ¿hay alguna entidad con ese país?
  const paisesEst = paisFijado ? [pais] : PAISES;
  const cargadoPorPais = (pp: string): boolean => {
    const kinds: EntKind[] = [
      "activos",
      "egresos",
      "ausencias",
      "capacitacion",
      "extras",
      "vacaciones",
      "merma",
      "terceros",
    ];
    return kinds.some((k) => (registros[k] ?? []).some((r) => (r.pais ?? "") === pp));
  };
  const paisLbl = paisFijado
    ? pais
    : pais !== "__all__"
      ? pais
      : "Consolidado (todos los países)";

  const base = CARDS.filter((c) => c.kind === "activos" || c.kind === "egresos");
  const comp = CARDS.filter((c) => c.kind !== "activos" && c.kind !== "egresos");

  return (
    <div id="v-admin">
      <div className="adm-head">
        <h2>Registrar resultados del mes</h2>
      </div>

      {/* Selector de período */}
      <div className="period">
        <span className="plabel">Periodo que estás cargando</span>
        <select value={monthIdx} disabled={busy} onChange={(e) => onMonth(+e.target.value)}>
          {MLONG.map((mn, i) => (
            <option key={mn} value={i}>
              {mn}
            </option>
          ))}
        </select>
        <select value={year} disabled={busy} onChange={(e) => onYear(+e.target.value)}>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={pais} disabled={busy || paisFijado} onChange={(e) => onPais(e.target.value)}>
          <option value="__all__">Todos los países</option>
          {PAISES.map((pp) => (
            <option key={pp} value={pp}>
              {pp}
            </option>
          ))}
        </select>
        <span className="phelp">→ es lo que se muestra en el dashboard</span>
      </div>

      <div className="autobox">
        <b>3 pasos:</b> <b>1)</b> elegí el mes y año de arriba · <b>2)</b> subí{" "}
        <b>Colaboradores activos</b> y <b>Egresos</b> (o la plantilla completa) —
        el sistema calcula la mayoría solo · <b>3)</b> completá los datos
        complementarios si aplican y presioná <b>Guardar</b>. El tablero se
        actualiza al instante.
      </div>

      {/* Asistente de carga del mes */}
      <CargaWizard
        curLbl={curLbl}
        paisLbl={paisLbl}
        paisesEst={paisesEst}
        cargadoPorPais={cargadoPorPais}
        busy={busy}
        onPlantilla={plantillaMaestra}
        onFile={subirMaestraFile}
      />

      {/* Carga maestra (un solo archivo) */}
      <div className="adm-sec">
        <span className="adm-step">★</span>
        <span className="adm-sec-t">
          Carga maestra — un solo archivo (punto de arranque)
        </span>
      </div>
      <div className="up-card" style={{ borderLeft: "4px solid var(--teal-d)" }}>
        <div className="up-head">
          <div className="up-ttl">
            <h3>Plantilla maestra de OLO (Excel)</h3>
            <p className="up-note">
              Punto de arranque para cada país. Descargá el Excel con todas las
              hojas: activos, egresos, incapacidades, permisos, vacaciones,
              capacitación, horas extras, terceros y datos por área. Cada hoja
              trae columnas <b>AÑO/MES</b> para cargar el mes actual y también
              meses/años anteriores en un solo archivo. Completá lo que tengas y
              subilo: el sistema reparte cada hoja y recalcula todo el tablero.
            </p>
          </div>
        </div>
        <div className="up-actions">
          <button className="mini solid" disabled={busy} onClick={plantillaMaestra}>
            ↓ Descargar plantilla maestra (actual e histórica)
          </button>
          <label className="mini save" style={{ cursor: "pointer" }}>
            ⤒ Subir carga maestra
            <input
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) subirMaestraFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="mini"
            disabled={busy}
            title="Elimina meses que quedaron sin datos reales"
            onClick={limpiar}
          >
            🧹 Limpiar meses sin datos
          </button>
        </div>
      </div>

      {/* 1 · Datos base */}
      <div className="adm-sec">
        <span className="adm-step">1</span>
        <span className="adm-sec-t">Datos base del mes</span>
        <span className="adm-fold-h" style={{ marginLeft: 8 }}>
          con estos dos, el tablero se arma solo
        </span>
      </div>
      <div className="up-grid">
        {base.map((c) => (
          <DataCard
            key={c.kind}
            kind={c.kind}
            title={c.title}
            note={c.note}
            rows={registros[c.kind] ?? []}
            mes={mes}
            pais={pais}
            busy={busy}
            onToast={toast}
            onReload={reload}
          />
        ))}
      </div>

      {/* 2 · Complementarios */}
      <div className="adm-sec">
        <span className="adm-step">2</span>
        <span className="adm-sec-t">Datos complementarios</span>
        <span className="adm-fold-h" style={{ marginLeft: 8 }}>
          solo si aplican — no salen de activos/egresos
        </span>
      </div>
      <div className="up-grid">
        {comp.map((c) => (
          <DataCard
            key={c.kind}
            kind={c.kind}
            title={c.title}
            note={c.note}
            rows={registros[c.kind] ?? []}
            mes={mes}
            pais={pais}
            busy={busy}
            onToast={toast}
            onReload={reload}
          />
        ))}
        {/* Parámetros del mes por grupo/área (ParamGrid). */}
        <ParamGrid
          params={params}
          busy={busy}
          onSave={onSaveParams}
          onPlantilla={(key) =>
            // Reutiliza la descarga por tipo con la clave del grupo de params.
            withRunning(async () => descargarPlantillaTipo(key, mes))
          }
        />
      </div>
    </div>
  );
}

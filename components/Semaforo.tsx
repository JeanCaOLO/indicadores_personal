// =============================================================================
// components/Semaforo.tsx
//
// Indicador de semáforo (tarea 13.1). Paridad visual 1:1 con el Sistema_Actual
// (out/index.html). En el builder `kpiSecHTML` el semáforo de una tarjeta es:
//
//   <span class="sem ${eslC?'':sm}"${eslC?` style="background:${eslC.color}"`:''}></span>
//
// donde `sm` es el status del semáforo ("ok"|"warn"|"danger"|"na") y `eslC`,
// si existe, es la banda ESL (en cuyo caso el color se pinta inline y NO se
// aplica clase de color). La leyenda de grupo usa la variante `.dot`:
//
//   <span class="dot ok|warn|danger|na"></span>
//
// CSS (ya portado en globals.css, tarea 12.1):
//   .kpi .sem{width:9px;height:9px;border-radius:50%;…}
//   .sem.ok{…}.sem.warn{…}.sem.danger{…}.sem.na{…}
//   .dot.ok{…}.dot.warn{…}.dot.danger{…}.dot.na{…}
//
// Componente de PRESENTACIÓN: recibe el `status` ya calculado (o una banda ESL
// con color inline). No recalcula nada; la clasificación la deriva el dashboard
// con `sem()`/`eslBand()` de core/semaphore.
//
// _Requirements: 2.2, 2.3, 16.3_
// =============================================================================

import type { SemStatus } from "@/core/semaphore";

export interface SemaforoProps {
  /**
   * Estado del semáforo: "ok" | "warn" | "danger" | "na".
   * Se ignora (no se aplica clase de color) cuando se pasa `color` (ESL),
   * replicando `class="sem ${eslC?'':sm}"` del sistema actual.
   */
  status?: SemStatus;
  /**
   * Color inline (banda ESL). Cuando está presente, el markup omite la clase
   * de color y pinta `style="background:${color}"`, igual que `eslC` en el index.
   */
  color?: string | null;
  /**
   * Variante de markup:
   *   - "sem" (default): el punto de la tarjeta `.kpi` → `<span class="sem …">`.
   *   - "dot": el punto de la leyenda de grupo → `<span class="dot …">`.
   */
  variant?: "sem" | "dot";
  /** Título accesible opcional (tooltip). */
  title?: string;
}

/**
 * Punto de semáforo. Reproduce exactamente el markup del Sistema_Actual:
 *   <span class="sem ok|warn|danger|na"></span>
 *   <span class="sem" style="background:#…"></span>   (banda ESL)
 *   <span class="dot ok|warn|danger|na"></span>       (leyenda)
 */
export function Semaforo({ status = "na", color, variant = "sem", title }: SemaforoProps) {
  // Paridad con `class="sem ${eslC?'':sm}"`: si hay color ESL, no se agrega la
  // clase de estado; el color va inline.
  const cls = color ? variant : `${variant} ${status}`;
  return (
    <span
      className={cls}
      style={color ? { background: color } : undefined}
      title={title}
    />
  );
}

export default Semaforo;

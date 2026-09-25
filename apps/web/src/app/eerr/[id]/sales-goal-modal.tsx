import type { RefObject } from "react";
import type { AnalysisResponse } from "@puro-origen/shared-types";
import type { SalesGoalMode } from "@puro-origen/domain";
import { Modal } from "../overlays";
import { formatAnalysisMoney } from "./analysis-format";
import { formatGoalPercent, type SalesGoalDraft } from "./sales-goal-form";
import styles from "./results-statement.module.css";

export function SalesGoalModal({ kind, context, saved, draft, pendingMode, busy, ready,
  error, conflict, refreshPending, confirmDiscard, inputRef, onClose, onDiscard,
  onValue, onMode, onConfirmMode, onCancelMode, onSave, onDelete, onRefresh }: {
  kind: "form" | "delete"; context: string; saved: AnalysisResponse["salesGoal"];
  draft: SalesGoalDraft; pendingMode: SalesGoalMode | null; busy: boolean; ready: boolean;
  error: string; conflict: boolean; refreshPending: boolean; confirmDiscard: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void; onDiscard: () => void; onValue: (value: string) => void;
  onMode: (mode: SalesGoalMode) => void; onConfirmMode: () => void;
  onCancelMode: () => void; onSave: () => void; onDelete: () => void;
  onRefresh: () => void;
}) {
  return <Modal title={kind === "delete" ? "Eliminar meta del EERR" : saved ? "Cambiar meta del EERR" : "Configurar meta del EERR"}
    context={context} busy={busy || refreshPending} onClose={onClose}
    footer="La meta pertenece solo a esta sucursal y período. No se clona ni se importa.">
    {kind === "delete" ? <div className={styles.goalForm}>
      <p>Se eliminará la meta de este EERR. El Punto de Equilibrio seguirá disponible, pero el Objetivo de Venta dejará de calcularse.</p>
      {conflict && <p role="alert">El EERR cambió. Actualizá los datos antes de volver a confirmar.</p>}
      {error && <p role="alert" className={styles.goalError}>{error}</p>}
      <div className={styles.goalActions}>
        {conflict || refreshPending ? <button type="button" disabled={busy} onClick={onRefresh}>Actualizar datos</button>
          : <button type="button" className={styles.dangerButton} disabled={busy || !ready} onClick={onDelete}>Confirmar eliminación de meta</button>}
        <button type="button" disabled={busy || refreshPending} onClick={onClose}>Cancelar</button>
      </div>
    </div> : <div className={styles.goalForm}>
      <p>Elegí una meta principal para esta sucursal y período. El Objetivo de Venta será una estimación basada en la estructura actual.</p>
      {saved && <p className={styles.currentGoal}>Meta guardada: {saved.mode === "NET_MARGIN_PERCENT"
        ? `Margen neto deseado · ${formatGoalPercent(saved.value)}`
        : `Ganancia neta deseada · ${formatAnalysisMoney(saved.value)}`}</p>}
      <fieldset className={styles.goalModes} disabled={busy || !!pendingMode || refreshPending}>
        <legend>Modalidad de la meta</legend>
        <label><input type="radio" name="sales-goal-mode" checked={draft.mode === "NET_MARGIN_PERCENT"}
          onChange={() => onMode("NET_MARGIN_PERCENT")} /> Margen neto deseado</label>
        <label><input type="radio" name="sales-goal-mode" checked={draft.mode === "NET_PROFIT_AMOUNT"}
          onChange={() => onMode("NET_PROFIT_AMOUNT")} /> Ganancia neta deseada</label>
      </fieldset>
      {pendingMode && <div className={styles.goalConfirm} role="alert">
        <p>La nueva modalidad cambia el significado de la meta. Se limpiará el valor ingresado; el borrador anterior no se reinterpretará.</p>
        <div className={styles.goalActions}>
          <button type="button" disabled={busy} onClick={onConfirmMode}>Cambiar modalidad y limpiar valor</button>
          <button type="button" disabled={busy} onClick={onCancelMode}>Conservar modalidad</button>
        </div>
      </div>}
      <p id="sales-goal-help">{draft.mode === "NET_MARGIN_PERCENT"
        ? "Porcentaje de ganancia neta deseada sobre ventas, desde 0 hasta menos de 100. Máximo cuatro decimales."
        : "Ganancia neta deseada en ARS, desde cero hasta 999.999.999.999,99. Máximo dos decimales; sin miles ni expresiones."}</p>
      <label className={styles.goalValueInput} htmlFor="sales-goal-value">{draft.mode === "NET_MARGIN_PERCENT" ? "Margen neto deseado" : "Ganancia neta deseada"}
        <span><input ref={inputRef} id="sales-goal-value" name="sales-goal-value" inputMode="decimal"
          autoComplete="off" value={draft.value} disabled={busy || refreshPending || !!pendingMode}
          aria-invalid={!!error} aria-describedby={`sales-goal-help${error ? " sales-goal-error" : ""}`}
          onChange={(event) => onValue(event.target.value)} />
          <span aria-hidden="true">{draft.mode === "NET_MARGIN_PERCENT" ? "%" : "ARS"}</span></span>
      </label>
      {error && <p id="sales-goal-error" role="alert" className={styles.goalError}>{error}</p>}
      {conflict && <div className={styles.goalConfirm} role="alert">
        <p>El EERR cambió. Conservamos tu modalidad y valor; actualizá los datos y revisá la meta vigente antes de volver a guardar.</p>
        <button type="button" disabled={busy} onClick={onRefresh}>Actualizar datos conservando borrador</button>
      </div>}
      {refreshPending && <div className={styles.goalConfirm} role="alert">
        <p>La meta se guardó, pero falta actualizar los resultados. No vuelvas a enviar el formulario.</p>
        <button type="button" disabled={busy} onClick={onRefresh}>Reintentar actualización</button>
      </div>}
      {confirmDiscard && <div className={styles.goalConfirm} role="alert">
        <p>Hay cambios de la meta sin guardar. Cancelar descartará únicamente este borrador; los demás borradores del EERR se conservan.</p>
        <div className={styles.goalActions}>
          <button type="button" disabled={busy} onClick={onDiscard}>Descartar borrador de meta</button>
          <button type="button" disabled={busy} onClick={onClose}>Continuar editando</button>
        </div>
      </div>}
      <div className={styles.goalActions}>
        <button type="button" className={styles.goalPrimary} disabled={busy || !ready || conflict || refreshPending || !!pendingMode}
          onClick={onSave}>{busy ? "Guardando meta…" : "Guardar meta"}</button>
        <button type="button" disabled={busy || refreshPending} onClick={onClose}>Cancelar</button>
      </div>
      <p className={styles.estimateNote} role="status" aria-live="polite">{busy ? "Guardando meta y actualizando resultados…" : "El guardado es explícito."}</p>
    </div>}
  </Modal>;
}

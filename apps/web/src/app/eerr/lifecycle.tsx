import type { EerrLifecycleStatus } from "@puro-origen/shared-types";
import { Modal } from "./overlays";
import styles from "./workspace.module.css";

export function LifecycleBadge({ status }: { status: EerrLifecycleStatus }) {
  return <span className={styles.lifecycleBadge} data-lifecycle={status}>Período {status === "CLOSED" ? "cerrado" : "abierto"}</span>;
}

export function LifecycleDialog({
  action, pending, busy, context, onCancel, onConfirm, onCompletePending,
}: {
  action: "close" | "reopen" | "delete";
  pending: number;
  busy: boolean;
  context: string;
  onCancel: () => void;
  onConfirm: () => void;
  onCompletePending: () => void;
}) {
  const title = action === "close" ? "Cerrar período" : action === "reopen" ? "Reabrir período" : "Eliminar período";
  return <Modal title={title} context={context} busy={busy} onClose={onCancel} footer={null}>
    {action === "close" && <>
      <p>El EERR seguirá disponible y editable. Las ediciones posteriores al cierre se auditan.</p>
      {pending > 0 && <p role="status" className={styles.lifecycleWarning}>Hay {pending} {pending === 1 ? "importe pendiente" : "importes pendientes"}. El cierre está permitido; las cantidades opcionales no se cuentan.</p>}
    </>}
    {action === "reopen" && <p>El EERR volverá a figurar como abierto. Se conservará la información del último cierre.</p>}
    {action === "delete" && <p className={styles.lifecycleWarning}>Esta acción quitará el EERR de las vistas normales. Solo se permite para un período abierto que nunca estuvo cerrado. Confirmá que querés eliminarlo.</p>}
    <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      {action === "close" && pending > 0 && <button type="button" disabled={busy} onClick={onCompletePending}>Marcar pendientes en 0</button>}
      <button type="button" className={action === "delete" ? styles.danger : styles.primary} disabled={busy} onClick={onConfirm}>
        {busy ? "Procesando…" : action === "close" && pending > 0 ? "Cerrar igualmente" : title}
      </button>
    </div>
  </Modal>;
}

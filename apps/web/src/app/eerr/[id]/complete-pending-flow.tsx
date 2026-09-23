"use client";
import { useEffect, useRef, useState } from "react";
import type {
  CompletePendingPreviewResponse,
  CompletePendingConfirmResponse,
} from "@puro-origen/shared-types";
import { eerrApi, EerrApiError } from "../api";
import { Modal } from "../overlays";
import styles from "../workspace.module.css";
const warning =
  "Esta acción cargará 0,00 ARS en todos los importes pendientes. No modificará cantidades ni cerrará el período.";
const percent = (p: { total: number; loaded: number }) =>
  p.total ? Math.round((100 * p.loaded) / p.total) : 0;
export function CompletePendingSummary({
  preview,
  stale,
  busy,
  blocked,
  onConfirm,
}: {
  preview: CompletePendingPreviewResponse;
  stale: boolean;
  busy: boolean;
  blocked: boolean;
  onConfirm: () => void;
}) {
  return (
    <section
      className={styles.importSummary}
      aria-label="Vista previa de importes pendientes"
    >
      <h3>
        {preview.destination.branchName} · {preview.destination.month}/
        {preview.destination.year}
      </h3>
      <p>
        {preview.before.total} ítems activos · {preview.before.loaded} importes
        ya cargados
      </p>
      <p>
        <strong>
          {preview.affected.length} importes se convertirán en cero
        </strong>
      </p>
      <p>
        Progreso: {preview.before.loaded}/{preview.before.total} (
        {percent(preview.before)} %) → {preview.after.loaded}/
        {preview.after.total} ({percent(preview.after)} %)
      </p>
      {!preview.affected.length && (
        <p role="status">
          No hay importes pendientes. No hay cambios por realizar.
        </p>
      )}
      {stale && (
        <p role="alert">
          La vista previa está desactualizada. El resumen se conserva; generá un
          preview actualizado.
        </p>
      )}
      {preview.affected.length > 0 && (
        <details>
          <summary>Revisar ítems afectados ({preview.affected.length})</summary>
          <ul className={styles.completePendingList}>
            {preview.affected.map((item) => (
              <li key={item.nodeId}>
                <strong>{item.name}</strong>
                <span>{item.path}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p>
        Revisión {preview.revision}. La vista previa vence a los cinco minutos.
      </p>
      <button
        className={styles.primary}
        disabled={
          busy ||
          blocked ||
          stale ||
          !preview.previewToken ||
          !preview.affected.length
        }
        onClick={onConfirm}
      >
        {busy ? "Completando…" : "Completar con cero"}
      </button>
    </section>
  );
}
export function CompletePendingFlow({
  id,
  pending,
  blocked,
  onBusy,
  onClose,
  onCompleted,
}: {
  id: string;
  pending: boolean;
  blocked: boolean;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
  onCompleted: (result: CompletePendingConfirmResponse) => void;
}) {
  const [preview, setPreview] = useState<CompletePendingPreviewResponse | null>(
      null,
    ),
    [stale, setStale] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sending = useRef(false);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  async function submit(confirm = false) {
    if (
      sending.current ||
      pending ||
      blocked ||
      (confirm && (!preview?.previewToken || stale || !preview.affected.length))
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify(
        confirm ? { previewToken: preview!.previewToken } : {},
      );
      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      };
      if (confirm) {
        const result = await eerrApi<CompletePendingConfirmResponse>(
          `/eerr/${id}/amounts/complete-pending/confirm`,
          options,
        );
        onCompleted(result);
        onClose();
      } else {
        setPreview(
          await eerrApi<CompletePendingPreviewResponse>(
            `/eerr/${id}/amounts/complete-pending/preview`,
            options,
          ),
        );
        setStale(false);
      }
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof EerrApiError && cause.status === 409) setStale(true);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Completar pendientes con cero"
      context="Solo importes activos sin cargar"
      busy={busy}
      onClose={() => {
        if (!sending.current) onClose();
      }}
      footer="Podrás editar los ceros o volver individualmente a Sin cargar. El período sigue editable."
    >
      <div className={styles.importSummary}>
        <p>{warning}</p>
        {pending ? (
          <p role="alert">
            Hay borradores sin guardar. Guardá o descartá cada cambio desde sus
            controles antes de generar el preview. Tus borradores se conservan.
          </p>
        ) : (
          <button disabled={busy || blocked} onClick={() => void submit()}>
            {preview ? "Actualizar vista previa" : "Generar vista previa"}
          </button>
        )}
        {busy && <p role="status">Procesando solicitud…</p>}
        {error && (
          <p role="alert" className={styles.fieldError}>
            {error}
          </p>
        )}
        {preview && (
          <CompletePendingSummary
            preview={preview}
            stale={stale}
            busy={busy}
            blocked={blocked || pending}
            onConfirm={() => void submit(true)}
          />
        )}
        <button disabled={busy} onClick={onClose}>
          {pending ? "Volver a los borradores" : "Cancelar"}
        </button>
      </div>
    </Modal>
  );
}

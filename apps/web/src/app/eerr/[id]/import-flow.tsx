"use client";
import { useEffect, useRef, useState } from "react";
import {
  IMPORT_LIMITS,
  type AmountCell,
  type QuantityCell,
} from "@puro-origen/domain";
import type {
  ImportPreviewResponse,
  ImportConfirmResponse,
} from "@puro-origen/shared-types";
import { eerrApi, eerrDownload, EerrApiError } from "../api";
import { Modal } from "../overlays";
import styles from "../workspace.module.css";
function value(cell: AmountCell | QuantityCell) {
  return cell.state === "SIN_CARGAR" ? "Sin cargar" : cell.value;
}
export function ImportSummary({
  preview,
  stale,
  busy,
  onConfirm,
}: {
  preview: ImportPreviewResponse;
  stale: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <section
      className={styles.importSummary}
      aria-label="Vista previa de importación"
    >
      <h3>
        {preview.destination.branchName} · {preview.destination.month}/
        {preview.destination.year}
      </h3>
      <p>
        {preview.fileName} · {preview.format.toUpperCase()} · {preview.readRows}{" "}
        filas leídas
      </p>
      <p>
        <strong>{preview.changedFields} campos cambiarían</strong> ·{" "}
        {preview.unchangedFields} sin cambios · {preview.affectedItems} ítems
        afectados
      </p>
      {stale && (
        <p role="alert" className={styles.notice}>
          Vista previa desactualizada. El archivo y este resumen se conservan;
          generá un nuevo preview para confirmar.
        </p>
      )}
      {preview.issues.length > 0 && (
        <div className={styles.notice} role="alert">
          <h4>No se puede confirmar: {preview.issues.length} errores</h4>
          <ul>
            {preview.issues.map((issue, i) => (
              <li key={i}>
                Fila {issue.row} · {issue.field}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
      <details>
        <summary>
          Revisar valores actuales y nuevos ({preview.rows.length} filas)
        </summary>
        <div className={styles.importRows}>
          {preview.rows.map((row) => (
            <article key={row.row} className={styles.importRow}>
              <h4>
                Fila {row.row} · {row.name}
              </h4>
              <p>
                Importe: {value(row.before.amount)} →{" "}
                <strong>{value(row.after.amount)}</strong> ARS
              </p>
              {row.before.amount.input && (
                <p>Expresión actual: {row.before.amount.input}</p>
              )}
              {row.after.amount.input && (
                <p>Expresión nueva: {row.after.amount.input}</p>
              )}
              <p>
                Cantidad: {value(row.before.quantity)} →{" "}
                <strong>{value(row.after.quantity)}</strong>
              </p>
              <p>
                {row.changed.length
                  ? "Cambios: " +
                    row.changed
                      .map((f) => (f === "amount" ? "importe" : "cantidad"))
                      .join(", ")
                  : "Sin cambios"}
              </p>
            </article>
          ))}
        </div>
      </details>
      <p>
        Revisión actual {preview.revision}. Vista previa válida durante cinco
        minutos.
      </p>
      <button
        className={styles.primary}
        disabled={
          busy ||
          stale ||
          preview.issues.length > 0 ||
          !preview.previewToken ||
          preview.changedFields === 0
        }
        onClick={onConfirm}
      >
        {busy ? "Importando…" : "Confirmar importación"}
      </button>
    </section>
  );
}
export function ImportFlow({
  id,
  canEdit,
  blocked,
  onDirty,
  onBusy,
  onImported,
}: {
  id: string;
  canEdit: boolean;
  blocked: boolean;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onImported: (result: ImportConfirmResponse) => void;
}) {
  const [open, setOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<ImportPreviewResponse | null>(null),
    [stale, setStale] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const sending = useRef(false),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onDirty(!!file);
  }, [file, onDirty]);
  useEffect(() => {
    onBusy(busy);
  }, [busy, onBusy]);
  function clear() {
    setFile(null);
    setPreview(null);
    setStale(false);
    setError("");
    setDiscard(false);
  }
  function close() {
    if (sending.current) return;
    if (file) setDiscard(true);
    else setOpen(false);
  }
  async function download(format: "csv" | "xlsx") {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const blob = await eerrDownload(
        `/eerr/${id}/import/template?format=${format}`,
      );
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `eerr-${id}.${format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function submit(confirm = false) {
    if (sending.current || !file || !canEdit || blocked) return;
    if (confirm && (!preview?.previewToken || preview.issues.length || stale))
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (confirm) body.append("previewToken", preview!.previewToken!);
      if (confirm) {
        const result = await eerrApi<ImportConfirmResponse>(
          `/eerr/${id}/import/confirm`,
          { method: "POST", body },
        );
        clear();
        setOpen(false);
        onImported(result);
      } else {
        const result = await eerrApi<ImportPreviewResponse>(
          `/eerr/${id}/import/preview`,
          { method: "POST", body },
        );
        setPreview(result);
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
    <>
      <button disabled={blocked} onClick={() => setOpen(true)}>
        {canEdit ? "Importar archivo" : "Descargar plantilla"}
      </button>
      {open && (
        <Modal
          title={canEdit ? "Importar valores" : "Descargar plantilla"}
          context="EERR existente · importes y cantidades"
          busy={busy}
          onClose={close}
          footer="La importación no crea categorías ni ítems. Conserva notas, nombres, orden e identidad."
        >
          <div className={styles.importSummary}>
            <p>
              Vacío: no modifica. <strong>0: carga cero.</strong>{" "}
              <strong>SIN_CARGAR: limpia el campo.</strong> Importe y cantidad
              son independientes.
            </p>
            <p>
              En XLSX, escribí importe_o_expresion como texto, incluso 0 y
              números simples. Usá expresiones como texto sin =. No se admiten
              fórmulas nativas de Excel, macros ni vínculos externos.
            </p>
            <div className={styles.actions}>
              <button disabled={busy} onClick={() => void download("csv")}>
                Descargar CSV
              </button>
              <button disabled={busy} onClick={() => void download("xlsx")}>
                Descargar XLSX
              </button>
            </div>
            {canEdit && (
              <>
                <label className={styles.importFile}>
                  Archivo CSV o XLSX
                  <input
                    ref={input}
                    type="file"
                    accept=".csv,.xlsx"
                    disabled={busy || blocked}
                    onChange={(event) => {
                      const next = event.target.files?.[0] ?? null;
                      setPreview(null);
                      setStale(false);
                      setError("");
                      if (next && next.size > IMPORT_LIMITS.fileBytes) {
                        setError("El archivo supera 2 MiB.");
                        setFile(null);
                        event.target.value = "";
                      } else setFile(next);
                    }}
                  />
                </label>
                <p>
                  Máximo 2 MiB, 1000 filas. CSV UTF-8 con punto y coma. Editá
                  solo importe_o_expresion y cantidad.
                </p>
                {file && (
                  <p>
                    Seleccionado: <strong>{file.name}</strong> ·{" "}
                    {file.name.split(".").at(-1)?.toUpperCase()} ·{" "}
                    {(file.size / 1024).toFixed(1)} KiB
                  </p>
                )}
                <div className={styles.actions}>
                  <button
                    className={styles.primary}
                    disabled={!file || busy || blocked}
                    onClick={() => void submit()}
                  >
                    Generar vista previa
                  </button>
                  <button
                    disabled={!file || busy}
                    onClick={() => input.current?.click()}
                  >
                    Reemplazar archivo
                  </button>
                </div>
              </>
            )}
            {busy && <p role="status">Procesando archivo…</p>}
            {error && (
              <p role="alert" className={styles.fieldError}>
                {error}
              </p>
            )}
            {preview && (
              <ImportSummary
                preview={preview}
                stale={stale}
                busy={busy}
                onConfirm={() => void submit(true)}
              />
            )}
          </div>
        </Modal>
      )}
      {discard && (
        <Modal
          title="Descartar importación pendiente"
          context="El archivo todavía no se aplicó"
          busy={busy}
          onClose={() => setDiscard(false)}
        >
          <p>
            Si cerrás, se descartarán el archivo seleccionado y su preview. Los
            datos guardados no cambian.
          </p>
          <div className={styles.actions}>
            <button onClick={() => setDiscard(false)}>
              Continuar importando
            </button>
            <button
              onClick={() => {
                clear();
                setOpen(false);
              }}
            >
              Descartar y cerrar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

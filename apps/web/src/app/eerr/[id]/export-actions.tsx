import { useRef, useState } from "react";
import { EerrApiError } from "../api";
import {
  downloadEerrExport,
  exportErrorMessage,
  type ExportFormat,
} from "../export-download";
import styles from "../workspace.module.css";

export function ExportActions({ id, onMissing }: { id: string; onMissing: () => void }) {
  const sending = useRef<Record<ExportFormat, boolean>>({ pdf: false, xlsx: false });
  const [busy, setBusy] = useState<Record<ExportFormat, boolean>>({ pdf: false, xlsx: false });
  const [error, setError] = useState("");

  async function start(format: ExportFormat) {
    if (sending.current[format]) return;
    sending.current[format] = true;
    setBusy((current) => ({ ...current, [format]: true }));
    setError("");
    try {
      await downloadEerrExport(id, format);
    } catch (cause) {
      if (cause instanceof EerrApiError && cause.status === 404) onMissing();
      else setError(exportErrorMessage(cause, format));
    } finally {
      sending.current[format] = false;
      setBusy((current) => ({ ...current, [format]: false }));
    }
  }

  return (
    <div className={styles.exportGroup} aria-label="Exportaciones del EERR">
      <div className={styles.exportActions}>
        <button type="button" disabled={busy.pdf} onClick={() => void start("pdf")}>{busy.pdf ? "Exportando PDF…" : "Exportar PDF"}</button>
        <button type="button" disabled={busy.xlsx} onClick={() => void start("xlsx")}>{busy.xlsx ? "Exportando Excel…" : "Exportar Excel"}</button>
      </div>
      <p className={`${styles.exportStatus} ${error ? styles.exportError : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || (busy.pdf || busy.xlsx ? "Preparando descarga…" : "")}</p>
    </div>
  );
}

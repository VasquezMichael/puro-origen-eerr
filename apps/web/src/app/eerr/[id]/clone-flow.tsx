"use client";
import { useRef, useState } from "react";
import type {
  CloneMode,
  CloneSource,
  ClonePreviewResponse,
  StructureResponse,
} from "@puro-origen/shared-types";
import { eerrApi, EerrApiError } from "../api";
import { Modal } from "../overlays";
import styles from "../workspace.module.css";
export const cloneModeLabel = (mode: CloneMode) =>
  mode === "ESTRUCTURA" ? "Clonar estructura" : "Clonar estructura y valores";
export function CloneSummary({
  preview,
  accepted,
  onAccept,
  busy,
  onConfirm,
  onBack,
}: {
  preview: ClonePreviewResponse;
  accepted: boolean;
  onAccept: (value: boolean) => void;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const c = preview.counts;
  return (
    <section
      className={styles.cloneSummary}
      aria-label="Vista previa de clonación"
    >
      <h3>{cloneModeLabel(preview.mode)}</h3>
      <p>
        <strong>Origen:</strong> {preview.source.branchName} ·{" "}
        {preview.source.month}/{preview.source.year}
      </p>
      <p>
        <strong>Destino:</strong> {preview.destination.branchName} ·{" "}
        {preview.destination.month}/{preview.destination.year}
      </p>
      <p>{c.blocks.join(" · ")}</p>
      <p>
        {preview.destinationCategories} categorías destino · {c.items} ítems
        activos. Origen: {c.categories} categorías.
      </p>
      <p>
        {c.loadedAmounts} importes cargados ({c.zeroAmounts} en cero);{" "}
        {c.unloadedAmounts} sin cargar. {c.loadedQuantities} cantidades cargadas
        ({c.zeroQuantities} en cero); {c.unloadedQuantities} sin cargar.
      </p>
      <h4>Se copiará</h4>
      <ul>
        {preview.included.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <h4>No se copiará</h4>
      <ul>
        {preview.excluded.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <p>
        {preview.seedTemplate
          ? "Se creará la plantilla de categorías del período destino. No se modificarán otros EERR."
          : "Se utilizarán todas las categorías, nombres y orden de la plantilla destino existente."}
      </p>
      <p>
        Revisiones: origen {preview.revisions.source} · destino{" "}
        {preview.revisions.destination} · plantilla{" "}
        {preview.revisions.template ?? "sin inicializar"}. Vista previa válida
        durante cinco minutos.
      </p>
      {preview.issues.length > 0 && (
        <div className={styles.notice} role="alert">
          <h4>No se puede clonar</h4>
          <ul>
            {preview.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p>
            Resolvé la plantilla global mediante las acciones de categorías o
            revisá el origen. No se fusionará ni corregirá automáticamente.
          </p>
        </div>
      )}
      {preview.crossBranchWarning && (
        <div className={styles.notice}>
          <p>
            <strong>{preview.crossBranchWarning}</strong>
          </p>
          <label className={styles.cloneConsent}>
            <input
              type="checkbox"
              checked={accepted}
              disabled={busy}
              onChange={(event) => onAccept(event.target.checked)}
            />
            Confirmo copiar valores de {preview.source.branchName} a{" "}
            {preview.destination.branchName}.
          </label>
        </div>
      )}
      <div className={styles.actions}>
        <button
          className={styles.primary}
          disabled={
            busy ||
            !preview.compatible ||
            !preview.previewToken ||
            (!!preview.crossBranchWarning && !accepted)
          }
          onClick={onConfirm}
        >
          {busy ? "Clonando…" : "Confirmar clonación"}
        </button>
        <button disabled={busy} onClick={onBack}>
          Volver a elegir origen
        </button>
      </div>
    </section>
  );
}
export function CloneFlow({
  id,
  data,
  disabled,
  pending,
  onBase,
  onInitialized,
  onReload,
}: {
  id: string;
  data: StructureResponse;
  disabled: boolean;
  pending: boolean;
  onBase: () => void;
  onInitialized: (result: StructureResponse, message: string) => void;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<CloneMode>("ESTRUCTURA"),
    [sourceId, setSourceId] = useState(""),
    [sources, setSources] = useState<CloneSource[] | null>(null),
    [preview, setPreview] = useState<ClonePreviewResponse | null>(null),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const sending = useRef(false);
  const selected = sources?.find((row) => row.id === sourceId);
  const eligible = !data.structure && data.revision === 0 && !data.note;
  async function load(mode: CloneMode) {
    if (sending.current) return;
    setMode(mode);
    setOpen(true);
    setPreview(null);
    setAccepted(false);
    setError("");
    setConflict(false);
    sending.current = true;
    setBusy(true);
    try {
      const rows = await eerrApi<CloneSource[]>(`/eerr/${id}/clone-sources`);
      setSources(rows);
      setSourceId((previous) =>
        rows.some((row) => row.id === previous)
          ? previous
          : mode === "ESTRUCTURA_Y_VALORES"
            ? (rows.find((row) => row.sameBranch)?.id ?? "")
            : (rows[0]?.id ?? ""),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function submit(confirm = false) {
    if (sending.current || !sourceId) return;
    if (
      confirm &&
      (!preview?.compatible ||
        !preview.previewToken ||
        (preview.crossBranchWarning && !accepted))
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const body = confirm
        ? {
            sourceEerrId: sourceId,
            mode,
            previewToken: preview!.previewToken,
            confirmCrossBranchValues: accepted,
          }
        : { sourceEerrId: sourceId, mode };
      const result = await eerrApi<ClonePreviewResponse | StructureResponse>(
        `/eerr/${id}/clone/${confirm ? "confirm" : "preview"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (confirm) {
        setOpen(false);
        onInitialized(
          result as StructureResponse,
          `${cloneModeLabel(mode)}: desde ${preview!.source.branchName} · ${preview!.source.month}/${preview!.source.year}.`,
        );
      } else {
        setPreview(result as ClonePreviewResponse);
        setAccepted(false);
        setConflict(false);
      }
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof EerrApiError && cause.status === 409) {
        setPreview(null);
        setAccepted(false);
        setConflict(true);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  if (data.structure) return null;
  return (
    <>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={disabled} onClick={onBase}>
          Usar estructura base
        </button>
        {eligible && (
          <>
            <button
              disabled={disabled || pending}
              onClick={() => void load("ESTRUCTURA")}
            >
              Clonar estructura
            </button>
            <button
              disabled={disabled || pending}
              onClick={() => void load("ESTRUCTURA_Y_VALORES")}
            >
              Clonar estructura y valores
            </button>
          </>
        )}
      </div>
      <p>
        La base usa las categorías vigentes. Clonar estructura deja valores sin
        cargar; clonar con valores conserva importes, expresiones y cantidades.
        Nunca copia notas ni archivados.
      </p>
      {!eligible && (
        <p className={styles.notice}>
          Este EERR tiene modificaciones; no admite clonación ni reemplazo.
        </p>
      )}
      {pending && (
        <p className={styles.notice}>
          Guardá o cancelá los borradores antes de clonar.
        </p>
      )}
      {open && (
        <Modal
          title={preview ? "Revisar clonación" : cloneModeLabel(mode)}
          context="Inicializar este EERR existente"
          busy={busy}
          onClose={() => {
            if (!sending.current) setOpen(false);
          }}
          footer="Nada se copia hasta confirmar. El origen se conserva sin cambios."
        >
          <div aria-live="polite">
            {busy && (
              <p role="status">{preview ? "Clonando…" : "Consultando…"}</p>
            )}
            {error && (
              <p role="alert" className={styles.fieldError}>
                {error}
              </p>
            )}
            {conflict && (
              <div className={styles.notice}>
                <p>
                  Se conservaron el modo y el origen. Generá un nuevo preview o
                  actualizá el destino.
                </p>
                <button disabled={busy} onClick={onReload}>
                  Actualizar destino
                </button>
              </div>
            )}
          </div>
          {preview ? (
            <CloneSummary
              preview={preview}
              accepted={accepted}
              onAccept={setAccepted}
              busy={busy}
              onConfirm={() => void submit(true)}
              onBack={() => {
                setPreview(null);
                setAccepted(false);
              }}
            />
          ) : (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label>
                Modo de clonación
                <select
                  value={mode}
                  disabled={busy}
                  onChange={(event) => {
                    setMode(event.target.value as CloneMode);
                    setAccepted(false);
                  }}
                >
                  <option value="ESTRUCTURA">Clonar estructura</option>
                  <option value="ESTRUCTURA_Y_VALORES">
                    Clonar estructura y valores
                  </option>
                </select>
              </label>
              <label>
                EERR origen
                <select
                  value={sourceId}
                  disabled={busy}
                  onChange={(event) => {
                    setSourceId(event.target.value);
                    setAccepted(false);
                  }}
                >
                  <option value="">Elegí un origen</option>
                  {sources?.map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.branchName} · {row.month}/{row.year} ·{" "}
                      {row.sameBranch ? "Misma sucursal" : "Otra sucursal"} ·{" "}
                      {row.samePeriod ? "Mismo período" : "Período anterior"}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div>
                  <p>
                    <strong>{selected.branchName}</strong> · {selected.month}/
                    {selected.year}
                  </p>
                  <p>
                    {selected.categories} categorías · {selected.items} ítems
                    activos · {selected.loadedAmounts} importes cargados ·{" "}
                    {selected.loadStatus.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
              )}
              {sources?.length === 0 && (
                <p>
                  No hay orígenes elegibles accesibles. Podés usar la estructura
                  base.
                </p>
              )}
              <div className={styles.actions}>
                <button className={styles.primary} disabled={busy || !sourceId}>
                  Generar vista previa
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void load(mode)}
                >
                  Actualizar orígenes
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

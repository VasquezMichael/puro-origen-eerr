"use client";
import { useId, useRef, useState } from "react";
import {
  evaluateMoneyExpression,
  normalizeQuantity,
  normalizeNote,
  EXPRESSION_LIMITS,
  QUANTITY_LIMITS,
} from "@puro-origen/domain";
import { changedValue, formatAmount } from "./workspace-model";
import styles from "../workspace.module.css";

export type FieldFeedback = {
  state: "saving" | "saved" | "error" | "conflict";
  message?: string;
};
type DraftProps = {
  canEdit: boolean;
  busy: boolean;
  conflict: boolean;
  draft: string | undefined;
  feedback?: FieldFeedback;
  onDraft: (value: string) => void;
  onCancel?: () => void;
  onSave: (body: object) => Promise<boolean> | boolean | void;
};
export function ValueEditor({
  kind,
  name,
  state,
  value,
  original,
  ...props
}: DraftProps & {
  kind: "amount" | "quantity";
  name: string;
  state: "SIN_CARGAR" | "CARGADO";
  value: string | null;
  original?: string | null;
}) {
  const id = useId();
  const money = kind === "amount";
  const persisted = original ?? value ?? "";
  const input = props.draft ?? persisted;
  const dirty = changedValue(props.draft, persisted);
  const [editing, setEditing] = useState(dirty);
  const trigger = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  let result = "",
    invalid = "";
  try {
    result = money
      ? evaluateMoneyExpression(input).value
      : normalizeQuantity(input);
  } catch (error) {
    invalid = (error as Error).message;
  }
  const error = props.feedback?.message || (dirty ? invalid : "");
  const saved =
    state === "SIN_CARGAR"
      ? "Sin cargar"
      : money
        ? formatAmount(value!)
        : value;
  function restoreFocus() {
    requestAnimationFrame(() => trigger.current?.focus());
  }
  function cancel() {
    if (props.busy) return;
    props.onCancel?.();
    setEditing(false);
    restoreFocus();
  }
  if (!props.canEdit || !editing)
    return (
      <div className={styles.readValue}>
        <strong className={styles.result}>{saved}</strong>
        {money &&
          original != null &&
          (original.length <= 64 ? (
            <span className={styles.expression}>{original}</span>
          ) : (
            <div className={styles.expression}>
              <span aria-hidden="true">{original.slice(0, 64)}…</span>
              <details>
                <summary>Ver expresión completa</summary>
                <span>{original}</span>
              </details>
            </div>
          ))}
        {props.canEdit && (
          <button
            ref={trigger}
            type="button"
            disabled={props.busy}
            aria-label={`Editar ${money ? "importe" : "cantidad"} de ${name}`}
            onClick={() => {
              setEditing(true);
              if (props.draft === undefined) props.onDraft(persisted);
              requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
              });
            }}
          >
            Editar {money ? "importe" : "cantidad"}
          </button>
        )}
        <small role="status">
          {dirty
            ? "Borrador conservado"
            : props.feedback?.state === "saved"
              ? "Guardado"
              : ""}
        </small>
      </div>
    );
  return (
    <form
      className={styles.valueEditor}
      aria-label={`${money ? "Importe" : "Cantidad"} de ${name}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!dirty || invalid || props.busy || props.conflict) return;
        if (await props.onSave({ state: "CARGADO", input })) {
          setEditing(false);
          restoreFocus();
        }
      }}
    >
      <label htmlFor={id}>
        {money ? "Importe o expresión" : "Cantidad"} · {name}
      </label>
      <input
        ref={inputRef}
        id={id}
        value={input}
        inputMode={money ? "text" : "numeric"}
        disabled={props.busy}
        maxLength={money ? EXPRESSION_LIMITS.length : QUANTITY_LIMITS.length}
        aria-invalid={!!error}
        aria-describedby={`${id}-feedback`}
        onChange={(event) => props.onDraft(event.target.value)}
      />
      <p
        id={`${id}-feedback`}
        className={error ? styles.fieldError : styles.feedback}
        aria-live="polite"
      >
        {error ? (
          <span role="alert">{error}</span>
        ) : !invalid ? (
          `Vista previa: ${money ? formatAmount(result) : result}`
        ) : (
          "Ingresá un valor"
        )}
      </p>
      <small className={styles.persisted}>Guardado: {saved}</small>
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.save}
          disabled={!dirty || props.busy || props.conflict || !!invalid}
          aria-label={`Guardar ${money ? "importe" : "cantidad"} de ${name}`}
        >
          Guardar
        </button>
        <button type="button" disabled={props.busy} onClick={cancel}>
          Cancelar
        </button>
      </div>
      <small role="status">
        {props.busy
          ? "Guardando…"
          : props.conflict
            ? "Conflicto · borrador conservado"
            : dirty
              ? "Borrador"
              : "Sin cambios"}
      </small>
    </form>
  );
}
export function NoteEditor({
  title,
  saved,
  limit,
  ...props
}: DraftProps & { title: string; saved: string | null; limit: number }) {
  const id = useId();
  const input = props.draft ?? saved ?? "";
  let invalid = "";
  try {
    normalizeNote(input, limit);
  } catch (error) {
    invalid = (error as Error).message;
  }
  const dirty = changedValue(props.draft, saved ?? "");
  if (!props.canEdit)
    return (
      <section>
        <h3>{title}</h3>
        <p className={styles.noteText}>{saved ?? "Sin nota"}</p>
      </section>
    );
  return (
    <form
      className={styles.noteEditor}
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !invalid && !props.busy && !props.conflict)
          props.onSave({ note: input });
      }}
    >
      <label htmlFor={id}>{title}</label>
      <textarea
        id={id}
        rows={6}
        value={input}
        maxLength={limit}
        disabled={props.busy}
        aria-invalid={!!(invalid || props.feedback?.message)}
        aria-describedby={`${id}-feedback`}
        onChange={(event) => props.onDraft(event.target.value)}
      />
      <p id={`${id}-feedback`} aria-live="polite">
        {props.feedback?.message || invalid ? (
          <span role="alert">{props.feedback?.message || invalid}</span>
        ) : (
          `${input.length} / ${limit} caracteres. Vaciar y guardar elimina la nota.`
        )}
      </p>
      <div className={styles.actions}>
        <button
          className={styles.primary}
          disabled={!dirty || !!invalid || props.busy || props.conflict}
        >
          Guardar nota
        </button>
        <span role="status">
          {props.feedback?.state === "saving"
            ? "Guardando…"
            : props.conflict && dirty
              ? "Conflicto · borrador conservado"
              : dirty
                ? "Borrador sin guardar"
                : props.feedback?.state === "saved"
                  ? "Guardado"
                  : "Sin cambios"}
        </span>
      </div>
    </form>
  );
}

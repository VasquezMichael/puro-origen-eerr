"use client";
import { useId } from "react";
import {
  evaluateMoneyExpression,
  normalizeQuantity,
  normalizeNote,
  EXPRESSION_LIMITS,
  QUANTITY_LIMITS,
} from "@puro-origen/domain";
import { changedValue } from "./workspace-model";
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
  onSave: (body: object) => void;
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
  const feedback =
    props.feedback?.state === "saving"
      ? "Guardando…"
      : props.conflict && dirty
        ? "Conflicto · revisá la versión actual"
        : error
          ? "Error"
          : dirty
            ? "Borrador"
            : props.feedback?.state === "saved"
              ? "Guardado"
              : "Sin cambios";
  const saved =
    state === "SIN_CARGAR"
      ? "SIN CARGAR"
      : `${money ? value?.replace(".", ",") : value}${money ? " ARS" : ""}`;
  if (!props.canEdit)
    return (
      <div className={styles.readValue}>
        <strong>{saved}</strong>
        {money && original != null && <small>{original}</small>}
      </div>
    );
  return (
    <form
      className={styles.valueEditor}
      aria-label={`${money ? "Importe" : "Cantidad"} de ${name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !invalid && !props.busy && !props.conflict)
          props.onSave({ state: "CARGADO", input });
      }}
    >
      <label className={styles.srOnly} htmlFor={id}>
        {money ? "Importe o expresión" : "Cantidad"} · {name}
      </label>
      <div className={styles.inputRow}>
        <input
          id={id}
          value={input}
          placeholder="Sin cargar"
          inputMode={money ? "text" : "numeric"}
          disabled={props.busy}
          maxLength={money ? EXPRESSION_LIMITS.length : QUANTITY_LIMITS.length}
          aria-invalid={!!error}
          aria-describedby={`${id}-feedback ${id}-saved`}
          onChange={(event) => props.onDraft(event.target.value)}
        />
        {dirty && (
          <button
            type="submit"
            className={styles.save}
            disabled={props.busy || props.conflict || !!invalid}
            aria-label={`Guardar ${money ? "importe" : "cantidad"} de ${name}`}
          >
            Guardar
          </button>
        )}
      </div>
      <small id={`${id}-saved`} className={styles.persisted}>
        {dirty ? `Guardado: ${saved}` : saved}
      </small>
      <small
        id={`${id}-feedback`}
        aria-live="polite"
        className={error ? styles.fieldError : styles.feedback}
      >
        {error ? (
          <span role="alert">{error}</span>
        ) : dirty && !invalid ? (
          `${result}${money ? " ARS" : " unidades"} · `
        ) : (
          ""
        )}
        {feedback}
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

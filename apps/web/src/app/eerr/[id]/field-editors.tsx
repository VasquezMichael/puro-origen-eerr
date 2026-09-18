"use client";

import { useId, useState } from "react";
import {
  evaluateMoneyExpression,
  normalizeQuantity,
  normalizeNote,
  EXPRESSION_LIMITS,
  QUANTITY_LIMITS,
} from "@puro-origen/domain";
import styles from "../layout.module.css";

type DraftProps = {
  canEdit: boolean;
  busy: boolean;
  conflict: boolean;
  draft: string | undefined;
  onDraft: (value: string) => void;
  onSave: (body: object, onError: (message: string) => void) => void;
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
  const [serverError, setServerError] = useState("");
  const money = kind === "amount";
  const input = props.draft ?? original ?? value ?? "";
  let result = "";
  let invalid = "";
  try {
    result = money
      ? evaluateMoneyExpression(input).value
      : normalizeQuantity(input);
  } catch (error) {
    invalid = (error as Error).message;
  }
  const disabled = props.busy || props.conflict;
  const error = serverError || (input ? invalid : "");
  function save(body: object) {
    setServerError("");
    props.onSave(body, setServerError);
  }
  return (
    <section
      className={styles.field}
      aria-label={`${money ? "Importe" : "Cantidad"} de ${name}`}
    >
      <p className="help">
        {money ? "Importe guardado" : "Cantidad guardada (opcional)"}
      </p>
      <p className={state === "SIN_CARGAR" ? "eerr-pending" : "eerr-amount"}>
        {state === "SIN_CARGAR"
          ? "SIN CARGAR"
          : `${money ? value?.replace(".", ",") : value}${money ? " ARS" : ""}`}
      </p>
      {money && state === "CARGADO" && original != null && (
        <p className={styles.savedText}>Expresión guardada: {original}</p>
      )}
      {props.canEdit && (
        <form
          className={`eerr-amount-form ${styles.amountForm}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid && !disabled) save({ state: "CARGADO", input });
          }}
        >
          <label htmlFor={id}>
            {money ? "Expresión de importe" : "Cantidad entera opcional"} ·{" "}
            {name}
            <input
              id={id}
              inputMode={money ? "text" : "numeric"}
              required
              value={input}
              disabled={props.busy}
              maxLength={
                money ? EXPRESSION_LIMITS.length : QUANTITY_LIMITS.length
              }
              aria-invalid={!!error}
              aria-describedby={`${id}-feedback`}
              onChange={(event) => {
                setServerError("");
                props.onDraft(event.target.value);
              }}
              placeholder={money ? "Ej. (1000 + 500) / 3" : "Ej. 12"}
            />
            <span id={`${id}-feedback`} className="help" aria-live="polite">
              {error ||
                (input && !invalid
                  ? `Vista previa: ${result}${money ? " ARS" : " unidades"} · ${props.draft === undefined ? "valor guardado" : "sin guardar"}`
                  : money
                    ? "Números, +, -, *, / y paréntesis. Sin miles."
                    : "Entero entre 0 y 999999999999. Independiente del importe.")}
            </span>
          </label>
          <div className={styles.actions}>
            <button className="primary-button" disabled={disabled || !!invalid}>
              Guardar {money ? "importe" : "cantidad"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => save({ state: "CARGADO", input: "0" })}
            >
              Cargar cero
            </button>
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => save({ state: "SIN_CARGAR" })}
            >
              Volver a sin cargar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function NoteEditor({
  title,
  saved,
  limit,
  ...props
}: DraftProps & { title: string; saved: string | null; limit: number }) {
  const id = useId();
  const [error, setError] = useState("");
  const input = props.draft ?? saved ?? "";
  const disabled = props.busy || props.conflict;
  function save(note: string) {
    setError("");
    try {
      normalizeNote(note, limit);
    } catch (error) {
      setError((error as Error).message);
      return;
    }
    props.onSave({ note }, setError);
  }
  return (
    <details className={styles.note}>
      <summary>
        {title}
        {saved ? " · con nota" : " · sin nota"}
        {props.draft !== undefined ? " · borrador sin guardar" : ""}
      </summary>
      <p className="help">Nota guardada</p>
      <p className={styles.savedText}>{saved ?? "Sin nota"}</p>
      {props.canEdit && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled) save(input);
          }}
        >
          <label htmlFor={id}>
            {title}
            <textarea
              id={id}
              rows={4}
              maxLength={limit}
              value={input}
              disabled={props.busy}
              aria-describedby={`${id}-feedback`}
              aria-invalid={!!error}
              onChange={(event) => {
                setError("");
                props.onDraft(event.target.value);
              }}
            />
          </label>
          <p id={`${id}-feedback`} className="help" aria-live="polite">
            {error ||
              `${input.length} / ${limit} caracteres. Vaciar elimina la nota.`}
          </p>
          <div className={styles.actions}>
            <button
              className="primary-button"
              disabled={disabled || input.length > limit}
            >
              Guardar nota
            </button>
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => save("")}
            >
              Eliminar nota
            </button>
          </div>
        </form>
      )}
    </details>
  );
}

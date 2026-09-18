"use client";

import Link from "next/link";
import styles from "../layout.module.css";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { NOTE_LIMITS, type StructureNode } from "@puro-origen/domain";
import type {
  CategoryPreviewResponse,
  StructureResponse,
} from "@puro-origen/shared-types";
import { eerrApi, EerrApiError } from "../api";
import { editorReducer, initialEditorState } from "./editor-state";
import { ValueEditor, NoteEditor } from "./field-editors";

type User = {
  isAdmin: boolean;
  branchAccesses: { branchId: string; role: string }[];
};
type Context = {
  user: User;
  branch: { name: string; active: boolean };
  eerr: { branchId: string; year: number; month: number };
};
type Action = {
  kind: "ITEM" | "CATEGORY" | "RENAME_ITEM" | "RENAME_CATEGORY";
  node: StructureNode;
  name: string;
  unit: string;
};

export function StructureWorkspace({ id }: { id: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [{ data, drafts, conflict }, dispatch] = useReducer(
    editorReducer,
    initialEditorState,
  );
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [prepare, setPrepare] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [preview, setPreview] = useState<CategoryPreviewResponse | null>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      eerrApi<{ user: User }>("/auth/me", options),
      eerrApi<Context["eerr"]>(`/eerr/${id}`, options),
      eerrApi<{ id: string; name: string; active: boolean }[]>(
        "/branches",
        options,
      ),
      eerrApi<StructureResponse>(`/eerr/${id}/structure`, options),
    ])
      .then(([auth, eerr, branches, structure]) => {
        const branch = branches.find((branch) => branch.id === eerr.branchId);
        if (!branch) throw new Error("Sucursal no accesible");
        setContext({ user: auth.user, eerr, branch });
        dispatch({ type: "RELOAD", data: structure });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [id, attempt]);
  const canEdit =
    !!context &&
    (context.user.isAdmin ||
      context.user.branchAccesses.some(
        (access) =>
          access.branchId === context.eerr.branchId && access.role === "EDITOR",
      ));
  async function perform<T>(
    path: string,
    method: string,
    body: object | undefined,
    success: (result: T) => void,
    failure?: (message: string) => void,
  ) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setStatus(method === "GET" ? "Recargando…" : "Guardando…");
    try {
      const result = await eerrApi<T>(`/eerr/${id}/${path}`, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      setStatus(
        method === "GET"
          ? "Estado actualizado. Los borradores se conservaron; revisalos antes de guardar."
          : "Operación completada.",
      );
      success(result);
    } catch (error) {
      setError((error as Error).message);
      failure?.((error as Error).message);
      setStatus("No se pudo completar la operación.");
      if (error instanceof EerrApiError && error.status === 409) {
        dispatch({ type: "CONFLICT" });
        setPreview(null);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function open(kind: Action["kind"], node: StructureNode) {
    setPreview(null);
    setAction({
      kind,
      node,
      name: kind.startsWith("RENAME") ? node.name : "",
      unit: "",
    });
    requestAnimationFrame(() => formHeading.current?.focus());
  }
  function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !data || conflict) return;
    const expectedRevision = data.revision;
    if (action.kind === "CATEGORY" || action.kind === "RENAME_CATEGORY") {
      void perform<CategoryPreviewResponse>(
        "categories/preview",
        "POST",
        {
          expectedRevision,
          name: action.name,
          ...(action.kind === "CATEGORY"
            ? { operation: "CREATE", parentCode: action.node.code }
            : { operation: "RENAME", code: action.node.code }),
        },
        setPreview,
      );
    } else {
      void perform<StructureResponse>(
        action.kind === "ITEM" ? "items" : `items/${action.node.nodeId}`,
        action.kind === "ITEM" ? "POST" : "PATCH",
        {
          expectedRevision,
          name: action.name,
          ...(action.kind === "ITEM"
            ? {
                parentId: action.node.nodeId,
                ...(action.unit ? { unit: action.unit } : {}),
              }
            : {}),
        },
        (result) => {
          dispatch({ type: "SAVED", data: result });
          setAction(null);
        },
      );
    }
  }
  function fieldProps(key: string) {
    return {
      canEdit,
      busy,
      conflict,
      draft: drafts[key],
      onDraft: (input: string) =>
        dispatch({ type: "DRAFT", draftKey: key, input }),
    };
  }
  function saveField(
    key: string,
    path: string,
    body: object,
    failure: (message: string) => void,
  ) {
    if (!data || conflict) return;
    void perform<StructureResponse>(
      path,
      "PUT",
      { expectedRevision: data.revision, ...body },
      (result) => {
        dispatch({ type: "SAVED", data: result, draftKey: key });
      },
      failure,
    );
  }
  const disabled = busy || conflict;
  function renderNodes(parentId: string | null): React.ReactNode {
    return data?.structure?.nodes
      .filter((node) => node.parentId === parentId)
      .sort((a, b) => a.position - b.position)
      .map((node) => {
        if (node.kind === "ITEM")
          return (
            <li className="eerr-item" key={node.nodeId}>
              <div className={styles.itemHeading}>
                <div>
                  <strong>{node.name}</strong>
                  {node.unit && <span className="help"> · {node.unit}</span>}
                </div>
                {canEdit && (
                  <button
                    className="text-button"
                    disabled={disabled}
                    onClick={() => open("RENAME_ITEM", node)}
                  >
                    Renombrar ítem
                  </button>
                )}
              </div>
              <ValueEditor
                kind="amount"
                name={node.name}
                state={node.amount?.state ?? "SIN_CARGAR"}
                value={node.amount?.value ?? null}
                original={node.amount?.input}
                {...fieldProps(node.nodeId)}
                onSave={(body, failure) =>
                  saveField(
                    node.nodeId,
                    `items/${node.nodeId}/amount`,
                    body,
                    failure,
                  )
                }
              />
              <ValueEditor
                kind="quantity"
                name={node.name}
                state={node.quantity?.state ?? "SIN_CARGAR"}
                value={node.quantity?.value ?? null}
                {...fieldProps(`quantity:${node.nodeId}`)}
                onSave={(body, failure) =>
                  saveField(
                    `quantity:${node.nodeId}`,
                    `items/${node.nodeId}/quantity`,
                    body,
                    failure,
                  )
                }
              />
              <NoteEditor
                title={`Nota del ítem · ${node.name}`}
                saved={node.note ?? null}
                limit={NOTE_LIMITS.item}
                {...fieldProps(`note:${node.nodeId}`)}
                onSave={(body, failure) =>
                  saveField(
                    `note:${node.nodeId}`,
                    `items/${node.nodeId}/note`,
                    body,
                    failure,
                  )
                }
              />
            </li>
          );
        return (
          <li
            key={node.nodeId}
            className={node.kind === "BLOCK" ? "eerr-block" : "eerr-category"}
          >
            <details open>
              <summary>
                {node.name}
                {node.kind === "CATEGORY" && (
                  <span className="help"> · Global del período</span>
                )}
              </summary>
              {canEdit && (
                <div className={styles.actions}>
                  <button
                    className="text-button"
                    disabled={disabled}
                    onClick={() => open("ITEM", node)}
                  >
                    Agregar ítem
                  </button>
                  <button
                    className="text-button"
                    disabled={disabled}
                    onClick={() => open("CATEGORY", node)}
                  >
                    Agregar categoría global
                  </button>
                  {node.kind === "CATEGORY" && (
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() => open("RENAME_CATEGORY", node)}
                    >
                      Renombrar categoría global
                    </button>
                  )}
                </div>
              )}
              <ul className="eerr-tree">{renderNodes(node.nodeId)}</ul>
            </details>
          </li>
        );
      });
  }
  return (
    <main className="branches-shell">
      <header className="branches-header">
        <Link className="brand-home" href="/">
          Puro de Origen <small>Estados de resultados</small>
        </Link>
        <Link className="text-button" href="/eerr">
          Volver a períodos
        </Link>
      </header>
      <div className="branches-title">
        <div>
          <p className="eyebrow">Estructura y carga manual</p>
          <h1>
            {context
              ? `${context.branch.name} · ${String(context.eerr.month).padStart(2, "0")}/${context.eerr.year}`
              : "Estado de resultados"}
          </h1>
          <p className="intro">
            Importes en pesos argentinos. Usá punto o coma decimal, sin
            separadores de miles.
          </p>
        </div>
      </div>
      {context && !context.branch.active && (
        <p className="notice">
          Sucursal inactiva: la corrección de este histórico está permitida para
          quienes tienen acceso de edición.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
      {!data || !context ? (
        <>
          <p>Comprobando sesión y EERR…</p>
          {error && (
            <button
              className="text-button"
              onClick={() => {
                setError("");
                setAttempt(attempt + 1);
              }}
            >
              Reintentar
            </button>
          )}
        </>
      ) : (
        <>
          <div className="branches-toolbar">
            <span>
              {data.progress.loaded} de {data.progress.total} ítems cargados ·{" "}
              {data.progress.pending} pendientes
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void perform<StructureResponse>(
                  "structure",
                  "GET",
                  undefined,
                  (result) => {
                    dispatch({ type: "RELOAD", data: result });
                    setPreview(null);
                  },
                )
              }
            >
              Recargar conservando borradores
            </button>
          </div>
          {conflict && (
            <p className="notice">
              Otro cambio impidió guardar. Tus borradores siguen visibles.
              Recargá el estado y revisá los valores antes de volver a guardar.
            </p>
          )}
          {!canEdit && <p className="notice">Acceso de lectura.</p>}
          <NoteEditor
            title="Nota general del EERR"
            saved={data.note ?? null}
            limit={NOTE_LIMITS.period}
            {...fieldProps("period-note")}
            onSave={(body, failure) =>
              saveField("period-note", "note", body, failure)
            }
          />
          {!data.structure ? (
            <section className="branch-feedback">
              <h2>Estructura sin preparar</h2>
              <p>
                Este EERR aún no tiene estructura ni importes. Prepararlo
                incorpora los tres bloques y las categorías globales vigentes
                del período.
              </p>
              {canEdit &&
                (prepare ? (
                  <div>
                    <p>¿Confirmás preparar únicamente este EERR?</p>
                    <button
                      className="primary-button"
                      disabled={disabled}
                      onClick={() =>
                        void perform<StructureResponse>(
                          "structure/initialize",
                          "POST",
                          { expectedRevision: data.revision },
                          (result) => {
                            dispatch({ type: "SAVED", data: result });
                            setPrepare(false);
                          },
                        )
                      }
                    >
                      Confirmar preparación
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setPrepare(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    className="primary-button"
                    disabled={disabled}
                    onClick={() => setPrepare(true)}
                  >
                    Preparar estructura
                  </button>
                ))}
            </section>
          ) : (
            <>
              {action && (
                <form
                  className="branch-form"
                  onSubmit={submitAction}
                  aria-busy={busy}
                >
                  <h2 ref={formHeading} tabIndex={-1}>
                    {action.kind.startsWith("RENAME") ? "Renombrar" : "Agregar"}{" "}
                    {action.kind.includes("CATEGORY")
                      ? "categoría global"
                      : "ítem"}{" "}
                    · {action.node.name}
                  </h2>
                  <fieldset disabled={busy || preview !== null}>
                    <label>
                      Nombre
                      <input
                        required
                        maxLength={120}
                        value={action.name}
                        onChange={(event) =>
                          setAction({ ...action, name: event.target.value })
                        }
                      />
                    </label>
                    {action.kind === "ITEM" && (
                      <>
                        <label>
                          Unidad (opcional)
                          <input
                            maxLength={40}
                            value={action.unit}
                            onChange={(event) =>
                              setAction({ ...action, unit: event.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                  </fieldset>
                  {action.kind.includes("CATEGORY") && (
                    <p className="notice">
                      Esta categoría se aplica a todas las sucursales del mismo
                      año y mes. La vista previa indica el alcance antes de
                      confirmar.
                    </p>
                  )}
                  {preview ? (
                    <section
                      className="branch-feedback"
                      aria-label="Vista previa global"
                    >
                      <h3>Confirmación del cambio global</h3>
                      <p>
                        {preview.operation === "CREATE" ? "Crear" : "Renombrar"}
                        : <strong>{preview.name}</strong> · Padre:{" "}
                        {preview.parent.name}
                      </p>
                      <p>
                        {preview.affected} EERR afectados: {preview.initialized}{" "}
                        preparados se actualizarán y {preview.uninitialized}{" "}
                        recibirán la categoría cuando se preparen.
                      </p>
                      <p>{preview.warning}</p>
                      <p className="help">
                        Esta vista previa vence en cinco minutos. Cualquier
                        cambio concurrente requiere revisarla nuevamente.
                      </p>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          void perform<StructureResponse>(
                            "categories/confirm",
                            "POST",
                            {
                              expectedRevision: data.revision,
                              previewId: preview.previewId,
                              confirm: true,
                            },
                            (result) => {
                              dispatch({ type: "SAVED", data: result });
                              setPreview(null);
                              setAction(null);
                            },
                          )
                        }
                      >
                        Confirmar cambio global
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        disabled={busy}
                        onClick={() => setPreview(null)}
                      >
                        Volver a editar
                      </button>
                    </section>
                  ) : (
                    <button className="primary-button" disabled={disabled}>
                      {action.kind.includes("CATEGORY")
                        ? "Revisar alcance global"
                        : "Guardar ítem"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setAction(null);
                      setPreview(null);
                    }}
                  >
                    Cancelar
                  </button>
                </form>
              )}
              <ul className="eerr-tree" aria-label="Estructura del EERR">
                {renderNodes(null)}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}

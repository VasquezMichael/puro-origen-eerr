"use client";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  NOTE_LIMITS,
  isArchived,
  cleanConceptName,
  type StructureNode,
} from "@puro-origen/domain";
import type {
  CategoryPreviewResponse,
  CategoryMovePreviewResponse,
  StructureResponse,
} from "@puro-origen/shared-types";
import { eerrApi, EerrApiError } from "../api";
import { MovementForm, type MovementSelection } from "./movement-form";
import { DraftNavigationGuard } from "./draft-navigation-guard";
import { WorkspaceShell } from "../workspace-shell";
import { Modal, ActionMenu } from "../overlays";
import styles from "../workspace.module.css";
import { editorReducer, initialEditorState } from "./editor-state";
import { ValueEditor, NoteEditor, type FieldFeedback } from "./field-editors";
import {
  visibleRows,
  availableActions,
  movementRank,
  incompatibleMovementDrafts,
  actionLabels,
  mayEdit,
  pendingDraftCount,
  type NodeAction,
} from "./workspace-model";

type User = {
  isAdmin: boolean;
  branchAccesses: { branchId: string; role: string }[];
};
type Context = {
  user: User;
  branch: { name: string; active: boolean };
  eerr: { branchId: string; year: number; month: number };
};
type Overlay = {
  kind: NodeAction | "GENERAL" | "PREPARE" | "ARCHIVED";
  nodeId?: string;
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
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [preview, setPreview] = useState<CategoryPreviewResponse | null>(null);
  const [movePreview, setMovePreview] =
    useState<CategoryMovePreviewResponse | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FieldFeedback>>({});
  const [conflictLabel, setConflictLabel] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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
        if (controller.signal.aborted) return;
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
  const canEdit = !!context && mayEdit(context.user, context.eerr.branchId);
  const nodes = data?.structure?.nodes ?? [];
  const node = nodes.find((n) => n.nodeId === overlay?.nodeId);
  const disabled = busy || conflict;
  function draft(key: string, input: string) {
    dispatch({ type: "DRAFT", draftKey: key, input });
    setFeedback((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }
  async function perform<T>(
    path: string,
    method: string,
    body: object | undefined,
    key: string,
    label: string,
    success: (result: T) => void,
  ) {
    if (sending.current || (method !== "GET" && (!canEdit || conflict)))
      return false;
    sending.current = true;
    setBusy(true);
    setError("");
    setFeedback((f) => ({ ...f, [key]: { state: "saving" } }));
    setStatus(`${method === "GET" ? "Recargando" : "Guardando"}: ${label}…`);
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
      success(result);
      setFeedback((f) => ({ ...f, [key]: { state: "saved" } }));
      setStatus(
        method === "GET"
          ? "Datos actualizados. Revisá tus borradores antes de guardar."
          : path.endsWith("/preview")
            ? `Vista previa lista: ${label}. Falta confirmar la publicación.`
            : `Guardado: ${label}.`,
      );
      return true;
    } catch (cause) {
      const message = (cause as Error).message;
      const isConflict = cause instanceof EerrApiError && cause.status === 409;
      setFeedback((f) => ({
        ...f,
        [key]: { state: isConflict ? "conflict" : "error", message },
      }));
      setError(`${label}: ${message}`);
      setStatus(`No se pudo guardar: ${label}. Borrador conservado.`);
      if (isConflict) {
        dispatch({ type: "CONFLICT" });
        setConflictLabel(label);
        setPreview(null);
        setMovePreview(null);
      }
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function reload() {
    void perform<StructureResponse>(
      "structure",
      "GET",
      undefined,
      "reload",
      "EERR",
      (result) => {
        dispatch({ type: "RELOAD", data: result });
        setPreview(null);
        setMovePreview(null);
        setFeedback({});
        setConflictLabel("");
        setOverlay((current) => {
          const item = result.structure?.nodes.find(
            (n) => n.nodeId === current?.nodeId,
          );
          if (!current || !item || item.kind !== "ITEM") return current;
          if (
            (isArchived(item) && current.kind !== "RESTORE") ||
            (!isArchived(item) && current.kind === "RESTORE")
          )
            return { kind: "DETAIL", nodeId: item.nodeId };
          return current;
        });
      },
    );
  }
  function open(kind: Overlay["kind"], nodeId?: string) {
    setError("");
    setPreview(null);
    setMovePreview(null);
    if (nodeId && (kind === "UP" || kind === "DOWN")) {
      const selected = nodes.find((n) => n.nodeId === nodeId)!;
      draft(
        `move:${nodeId}`,
        JSON.stringify({
          parentId: selected.parentId,
          position:
            movementRank(nodes, selected).index + (kind === "UP" ? -1 : 1),
        }),
      );
      kind = selected.kind === "CATEGORY" ? "MOVE_CATEGORY" : "MOVE_ITEM";
    }
    setOverlay({ kind, nodeId });
  }
  function close() {
    if (!sending.current) {
      setOverlay(null);
      setPreview(null);
      setMovePreview(null);
    }
  }
  function saveField(key: string, path: string, body: object, label: string) {
    if (!data) return false;
    return perform<StructureResponse>(
      path,
      "PUT",
      { ...body, expectedRevision: data.revision },
      key,
      label,
      (result) => dispatch({ type: "SAVED", data: result, draftKey: key }),
    );
  }
  function fieldProps(key: string) {
    return {
      canEdit,
      busy,
      conflict,
      draft: drafts[key],
      feedback: feedback[key],
      onDraft: (input: string) => draft(key, input),
      onCancel: () => {
        dispatch({ type: "CANCEL", draftKey: key });
        setFeedback((previous) => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
      },
    };
  }
  function valueEditor(item: StructureNode, kind: "amount" | "quantity") {
    const key = kind === "amount" ? item.nodeId : `quantity:${item.nodeId}`;
    const cell = kind === "amount" ? item.amount : item.quantity;
    return (
      <ValueEditor
        kind={kind}
        name={item.name}
        state={cell?.state ?? "SIN_CARGAR"}
        value={cell?.value ?? null}
        original={kind === "amount" ? item.amount?.input : undefined}
        {...fieldProps(key)}
        canEdit={canEdit && !isArchived(item)}
        onSave={(body) =>
          saveField(
            key,
            `items/${item.nodeId}/${kind}`,
            body,
            `${kind === "amount" ? "Importe" : "Cantidad"} · ${item.name}`,
          )
        }
      />
    );
  }
  const moveKey = node ? `move:${node.nodeId}` : "";
  const moveSelection: MovementSelection =
    node && drafts[moveKey]
      ? JSON.parse(drafts[moveKey])
      : {
          parentId: node?.parentId ?? "",
          position: node ? movementRank(nodes, node).index : 0,
        };
  function movementSaved(result: StructureResponse) {
    dispatch({ type: "SAVED", data: result, draftKey: moveKey });
    setOverlay(null);
    setMovePreview(null);
    setCollapsed(new Set());
  }
  function submitMovement() {
    if (!node || !data || incompatibleMovementDrafts(data, drafts, node.nodeId))
      return;
    const body = { ...moveSelection, expectedRevision: data.revision };
    if (node.kind === "CATEGORY")
      void perform<CategoryMovePreviewResponse>(
        "categories/move/preview",
        "POST",
        { ...body, nodeId: node.nodeId },
        moveKey,
        `Movimiento · ${node.name}`,
        setMovePreview,
      );
    else
      void perform<StructureResponse>(
        `items/${node.nodeId}/move`,
        "PATCH",
        body,
        moveKey,
        `Movimiento · ${node.name}`,
        movementSaved,
      );
  }
  const actionKey =
    node && overlay
      ? overlay.kind === "RENAME_ITEM" || overlay.kind === "DETAIL"
        ? `name:${node.nodeId}`
        : `action:${overlay.kind}:${node.nodeId}`
      : "";
  const actionName =
    drafts[actionKey] ??
    (overlay?.kind.startsWith("RENAME") || overlay?.kind === "DETAIL"
      ? (node?.name ?? "")
      : "");
  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !node || !overlay || disabled) return;
    try {
      cleanConceptName(actionName);
    } catch (cause) {
      setFeedback((f) => ({
        ...f,
        [actionKey]: { state: "error", message: (cause as Error).message },
      }));
      return;
    }
    if (overlay.kind.includes("CATEGORY")) {
      void perform<CategoryPreviewResponse>(
        "categories/preview",
        "POST",
        {
          expectedRevision: data.revision,
          name: actionName,
          ...(overlay.kind === "CATEGORY"
            ? { operation: "CREATE", parentCode: node.code }
            : { operation: "RENAME", code: node.code }),
        },
        actionKey,
        `Categoría · ${actionName}`,
        setPreview,
      );
    } else {
      const creating = overlay.kind === "ITEM";
      void perform<StructureResponse>(
        creating ? "items" : `items/${node.nodeId}`,
        creating ? "POST" : "PATCH",
        {
          expectedRevision: data.revision,
          name: actionName,
          ...(creating
            ? {
                parentId: node.nodeId,
                ...(drafts[`${actionKey}:unit`]
                  ? { unit: drafts[`${actionKey}:unit`] }
                  : {}),
              }
            : {}),
        },
        actionKey,
        `Ítem · ${actionName}`,
        (result) => {
          dispatch({ type: "SAVED", data: result, draftKey: actionKey });
          if (creating)
            dispatch({
              type: "SAVED",
              data: result,
              draftKey: `${actionKey}:unit`,
            });
          if (overlay.kind !== "DETAIL") setOverlay(null);
        },
      );
    }
  }
  function nameForm() {
    return (
      <form className={styles.form} onSubmit={saveName}>
        <label>
          Nombre
          <input
            required
            maxLength={120}
            value={actionName}
            disabled={busy || !!preview}
            aria-invalid={!!feedback[actionKey]?.message}
            aria-describedby="name-feedback"
            onChange={(event) => draft(actionKey, event.target.value)}
          />
        </label>
        {overlay?.kind === "ITEM" && (
          <label>
            Unidad (opcional)
            <input
              maxLength={40}
              value={drafts[`${actionKey}:unit`] ?? ""}
              disabled={busy}
              onChange={(event) =>
                draft(`${actionKey}:unit`, event.target.value)
              }
            />
          </label>
        )}
        <div id="name-feedback">
          {feedback[actionKey]?.message && (
            <p role="alert" className={styles.fieldError}>
              {feedback[actionKey].message}
            </p>
          )}
        </div>
        <button
          className={styles.primary}
          disabled={disabled || !!preview || !actionName.trim()}
        >
          {overlay?.kind.includes("CATEGORY")
            ? "Revisar alcance global"
            : overlay?.kind === "ITEM"
              ? "Crear ítem"
              : "Guardar nombre"}
        </button>
      </form>
    );
  }
  const conflictNotice = conflict && (
    <div className={styles.conflict} role="alert">
      <strong>Conflicto en {conflictLabel}.</strong>
      <p>
        Otra edición cambió el EERR. Conservamos todos tus borradores; recargá y
        revisá antes de guardar.
      </p>
      <button disabled={busy} onClick={reload}>
        Recargar conservando borradores
      </button>
    </div>
  );
  const period = context
    ? `${String(context.eerr.month).padStart(2, "0")}/${context.eerr.year}`
    : "";
  const pending = pendingDraftCount(data, drafts);
  const archived = nodes.filter(isArchived);
  return (
    <WorkspaceShell
      role={
        context
          ? context.user.isAdmin
            ? "Administrador"
            : canEdit
              ? "Editor"
              : "Lector"
          : "Comprobando sesión"
      }
      isAdmin={context?.user.isAdmin}
      status={
        status ||
        (pending
          ? `${pending} borradores conservados`
          : "Sin cambios pendientes")
      }
    >
      <DraftNavigationGuard
        key={pending > 0 ? "dirty" : "clean"}
        dirty={pending > 0}
        busy={busy}
      />
      {!data || !context ? (
        <section>
          <h1>Estado de resultados</h1>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button
                onClick={() => {
                  setError("");
                  setAttempt(attempt + 1);
                }}
              >
                Reintentar
              </button>
            </>
          ) : (
            <p>Comprobando sesión y EERR…</p>
          )}
        </section>
      ) : (
        <>
          <header className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>Espacio de carga · {period}</p>
              <h1>{context.branch.name}</h1>
              <div className={styles.meta}>
                <span className={styles.badge}>
                  {
                    {
                      SIN_CARGAR: "Sin cargar",
                      PARCIAL: "Carga parcial",
                      CARGADO: "Cargado",
                    }[data.progress.status]
                  }
                </span>
                <span>Pesos argentinos · ARS</span>
                {!context.branch.active && (
                  <span>Histórico · sucursal inactiva</span>
                )}
                {!canEdit && <span>Solo lectura</span>}
              </div>
            </div>
          </header>
          <div className={styles.toolbar}>
            <div className={styles.progress}>
              <strong>
                {data.progress.loaded} / {data.progress.total}
              </strong>
              <span>
                importes cargados · {data.progress.pending} pendientes
              </span>
              <progress
                aria-label="Progreso de importes"
                value={data.progress.loaded}
                max={data.progress.total || 1}
              />
            </div>
            <div className={styles.actions}>
              <button onClick={() => open("GENERAL")}>
                {canEdit ? "Nota general" : "Ver nota general"}
                {data.note ? " · con nota" : ""}
              </button>
              {canEdit && data.structure && (
                <ActionMenu
                  name="estructura"
                  disabled={disabled}
                  actions={[
                    {
                      label: "Agregar categoría global",
                      run: () =>
                        open(
                          "CATEGORY",
                          nodes.find((n) => n.kind === "BLOCK")?.nodeId,
                        ),
                    },
                    {
                      label: "Agregar ítem",
                      run: () =>
                        open(
                          "ITEM",
                          nodes.find((n) => n.kind === "BLOCK")?.nodeId,
                        ),
                    },
                  ]}
                />
              )}
              {archived.length > 0 && (
                <button disabled={busy} onClick={() => open("ARCHIVED")}>
                  Ver ítems archivados ({archived.length})
                </button>
              )}
              {!conflict && (
                <button disabled={busy} onClick={reload}>
                  Actualizar
                </button>
              )}
            </div>
          </div>
          {!overlay && conflictNotice}
          {error && !conflict && !overlay && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {pending > 0 && (
            <p className={styles.draftNotice}>
              {pending}{" "}
              {pending === 1 ? "borrador conservado" : "borradores conservados"}{" "}
              en este EERR. Guardá cada campo explícitamente.
            </p>
          )}
          {!data.structure ? (
            <section className={styles.empty}>
              <h2>Estructura sin preparar</h2>
              <p>
                Prepará los bloques y las categorías globales del período para
                comenzar.
              </p>
              {canEdit && (
                <button
                  className={styles.primary}
                  disabled={disabled}
                  onClick={() => open("PREPARE")}
                >
                  Preparar estructura
                </button>
              )}
            </section>
          ) : (
            <>
              <div className={styles.gridIntro}>
                <h2>Estructura y valores</h2>
                <span>
                  {canEdit
                    ? "Enter guarda el campo editado · punto o coma decimal, sin miles"
                    : "Valores guardados del período"}
                </span>
              </div>
              <table className={styles.grid} aria-label="Estructura del EERR">
                <thead>
                  <tr>
                    <th scope="col">Estructura</th>
                    <th scope="col">Importe / expresión</th>
                    <th scope="col" className={styles.quantityColumn}>
                      Cantidad
                    </th>
                    <th scope="col" className={styles.noteColumn}>
                      Nota
                    </th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows(nodes, collapsed).map(
                    ({ node: item, depth }) => (
                      <tr
                        key={item.nodeId}
                        data-node-id={item.nodeId}
                        data-depth={depth}
                        className={
                          item.kind === "BLOCK"
                            ? styles.blockRow
                            : item.kind === "CATEGORY"
                              ? styles.categoryRow
                              : styles.itemRow
                        }
                      >
                        <th scope="row">
                          <div
                            className={styles.nodeName}
                            style={{ "--depth": depth } as CSSProperties}
                          >
                            {item.kind !== "ITEM" ? (
                              <button
                                className={styles.fold}
                                aria-expanded={!collapsed.has(item.nodeId)}
                                aria-label={`${collapsed.has(item.nodeId) ? "Expandir" : "Contraer"} ${item.name}`}
                                onClick={() =>
                                  setCollapsed((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(item.nodeId))
                                      next.delete(item.nodeId);
                                    else next.add(item.nodeId);
                                    return next;
                                  })
                                }
                              >
                                <span aria-hidden="true">
                                  {collapsed.has(item.nodeId) ? "▸" : "▾"}
                                </span>
                                <span>{item.name}</span>
                              </button>
                            ) : (
                              <>
                                <span>{item.name}</span>
                                {item.unit && <small>{item.unit}</small>}
                              </>
                            )}
                            {item.kind === "BLOCK" && (
                              <small>Bloque protegido</small>
                            )}
                            {item.kind === "CATEGORY" && (
                              <small>Global del período</small>
                            )}
                          </div>
                        </th>
                        <td>
                          {item.kind === "ITEM" && valueEditor(item, "amount")}
                        </td>
                        <td className={styles.quantityColumn}>
                          {item.kind === "ITEM" &&
                            valueEditor(item, "quantity")}
                        </td>
                        <td className={styles.noteColumn}>
                          {item.kind === "ITEM" && (
                            <button
                              className={styles.noteButton}
                              onClick={() => open("NOTE", item.nodeId)}
                              aria-label={`${canEdit ? "Editar" : "Ver"} nota de ${item.name}`}
                            >
                              {drafts[`note:${item.nodeId}`] !== undefined
                                ? "Borrador"
                                : item.note
                                  ? "Con nota"
                                  : "Sin nota"}
                            </button>
                          )}
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            {item.kind === "ITEM" && (
                              <button
                                onClick={() => open("DETAIL", item.nodeId)}
                                aria-label={`${canEdit ? "Editar" : "Ver"} detalle de ${item.name}`}
                              >
                                {canEdit ? "Detalle" : "Ver detalle"}
                              </button>
                            )}
                            {canEdit && (
                              <ActionMenu
                                name={item.name}
                                disabled={disabled}
                                actions={availableActions(
                                  nodes,
                                  item,
                                  canEdit,
                                ).map((kind) => ({
                                  label: actionLabels[kind],
                                  run: () => open(kind, item.nodeId),
                                }))}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </>
          )}
          {overlay && (
            <Modal
              title={
                preview || movePreview
                  ? "Confirmar publicación global"
                  : overlay.kind === "ARCHIVED"
                    ? "Ítems archivados"
                    : overlay.kind === "GENERAL"
                      ? "Nota general del EERR"
                      : overlay.kind === "PREPARE"
                        ? "Preparar estructura"
                        : overlay.kind === "DETAIL"
                          ? canEdit
                            ? "Detalle del ítem"
                            : "Consultar ítem"
                          : overlay.kind === "NOTE" && !canEdit
                            ? "Nota del ítem"
                            : actionLabels[overlay.kind]
              }
              context={`${context.branch.name} · ${period}${node ? ` · ${node.name}` : ""}`}
              busy={busy}
              onClose={close}
            >
              {conflictNotice}
              {error && !conflict && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              {overlay.kind === "ARCHIVED" && (
                <ul className={styles.archivedList}>
                  {archived.map((item) => (
                    <li key={item.nodeId}>
                      <h3>
                        {item.name}{" "}
                        <span className={styles.badge}>Archivado</span>
                      </h3>
                      <p>
                        Ubicación:{" "}
                        {nodes.find((parent) => parent.nodeId === item.parentId)
                          ?.name ?? "Padre no disponible"}
                      </p>
                      {valueEditor(item, "amount")}
                      <p>
                        Cantidad:{" "}
                        {item.quantity?.state === "CARGADO"
                          ? item.quantity.value
                          : "Sin cargar"}
                      </p>
                      <p className={styles.noteText}>
                        {item.note ?? "Sin nota"}
                      </p>
                      <div className={styles.actions}>
                        <button onClick={() => open("DETAIL", item.nodeId)}>
                          Consultar detalle de {item.name}
                        </button>
                        {canEdit && (
                          <button
                            disabled={disabled}
                            onClick={() => open("RESTORE", item.nodeId)}
                          >
                            Restaurar ítem {item.name}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {overlay.kind === "GENERAL" && (
                <NoteEditor
                  title="Nota general"
                  saved={data.note ?? null}
                  limit={NOTE_LIMITS.period}
                  {...fieldProps("period-note")}
                  onSave={(body) =>
                    saveField("period-note", "note", body, "Nota general")
                  }
                />
              )}
              {overlay.kind === "PREPARE" && (
                <>
                  <p>
                    Esta acción incorpora los bloques y categorías vigentes
                    únicamente en este EERR, sin cargar importes.
                  </p>
                  <button
                    className={styles.primary}
                    disabled={disabled}
                    onClick={() =>
                      void perform<StructureResponse>(
                        "structure/initialize",
                        "POST",
                        { expectedRevision: data.revision },
                        "prepare",
                        "Preparar estructura",
                        (result) => {
                          dispatch({ type: "SAVED", data: result });
                          setOverlay(null);
                        },
                      )
                    }
                  >
                    Confirmar preparación
                  </button>
                </>
              )}
              {node && (
                <>
                  {(overlay.kind === "MOVE_ITEM" ||
                    overlay.kind === "MOVE_CATEGORY") && (
                    <MovementForm
                      nodes={nodes}
                      node={node}
                      selection={moveSelection}
                      onChange={(value) => {
                        draft(moveKey, JSON.stringify(value));
                        setMovePreview(null);
                      }}
                      preview={movePreview}
                      busy={busy}
                      disabled={disabled}
                      incompatible={
                        incompatibleMovementDrafts(data, drafts, node.nodeId) >
                        0
                      }
                      onSubmit={submitMovement}
                      onBack={() => setMovePreview(null)}
                      onClose={close}
                      onConfirm={() => {
                        if (movePreview)
                          void perform<StructureResponse>(
                            "categories/move/confirm",
                            "POST",
                            {
                              expectedRevision: data.revision,
                              previewId: movePreview.previewId,
                              confirm: true,
                            },
                            moveKey,
                            `Movimiento global · ${node.name}`,
                            movementSaved,
                          );
                      }}
                    />
                  )}
                  {isArchived(node) && overlay.kind === "DETAIL" && (
                    <p className={styles.notice}>
                      Archivado · solo consulta. Ubicación:{" "}
                      {nodes.find((parent) => parent.nodeId === node.parentId)
                        ?.name ?? "Padre no disponible"}
                    </p>
                  )}
                  {(overlay.kind === "ARCHIVE" ||
                    overlay.kind === "RESTORE") && (
                    <section>
                      <p>
                        Ubicación:{" "}
                        {nodes.find((parent) => parent.nodeId === node.parentId)
                          ?.name ?? "Padre no disponible"}
                      </p>
                      <p>
                        {overlay.kind === "ARCHIVE"
                          ? "El ítem dejará la carga activa y el progreso. No se eliminarán sus datos; podrás restaurarlo en este EERR."
                          : "El ítem volverá a su padre y se insertará en la posición archivada, ajustada al rango actual. Los hermanos activos se desplazarán cuando corresponda; todos sus valores se conservan."}
                      </p>
                      <div className={styles.actions}>
                        <button
                          className={styles.primary}
                          disabled={disabled}
                          onClick={() =>
                            void perform<StructureResponse>(
                              `items/${node.nodeId}/${overlay.kind === "ARCHIVE" ? "archive" : "restore"}`,
                              "PATCH",
                              { expectedRevision: data.revision },
                              `archive:${node.nodeId}`,
                              `${actionLabels[overlay.kind as "ARCHIVE" | "RESTORE"]} · ${node.name}`,
                              (result) => {
                                dispatch({ type: "SAVED", data: result });
                                setOverlay(null);
                              },
                            )
                          }
                        >
                          {overlay.kind === "ARCHIVE"
                            ? "Confirmar archivo"
                            : "Confirmar restauración"}
                        </button>
                        <button disabled={busy} onClick={close}>
                          Cancelar
                        </button>
                      </div>
                    </section>
                  )}
                  {(overlay.kind === "ITEM" || overlay.kind === "CATEGORY") &&
                    !preview && (
                      <label className={styles.parentSelector}>
                        Ubicación
                        <select
                          value={node.nodeId}
                          disabled={busy}
                          onChange={(event) =>
                            setOverlay({
                              ...overlay,
                              nodeId: event.target.value,
                            })
                          }
                        >
                          {nodes
                            .filter((n) => n.kind !== "ITEM")
                            .map((n) => (
                              <option key={n.nodeId} value={n.nodeId}>
                                {n.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  {([
                    "ITEM",
                    "CATEGORY",
                    "RENAME_ITEM",
                    "RENAME_CATEGORY",
                  ].includes(overlay.kind) ||
                    (overlay.kind === "DETAIL" &&
                      canEdit &&
                      !isArchived(node))) &&
                    !preview &&
                    nameForm()}
                  {overlay.kind.includes("CATEGORY") && !preview && (
                    <p className={styles.notice}>
                      El cambio es global para todas las sucursales del mismo
                      año y mes. Revisá el alcance antes de confirmar.
                    </p>
                  )}
                  {preview && (
                    <section aria-label="Vista previa global">
                      <h3>{preview.name}</h3>
                      <p>
                        Ubicación: {preview.parent.name} · {preview.month}/
                        {preview.year}
                      </p>
                      <p>
                        <strong>{preview.affected} EERR afectados</strong>:{" "}
                        {preview.initialized} preparados y{" "}
                        {preview.uninitialized} sin preparar.
                      </p>
                      <p>{preview.warning}</p>
                      <p>
                        La vista previa vence en cinco minutos. Un cambio
                        concurrente requiere volver a revisarla.
                      </p>
                      <div className={styles.actions}>
                        <button
                          className={styles.primary}
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
                              actionKey,
                              `Categoría · ${preview.name}`,
                              (result) => {
                                dispatch({
                                  type: "SAVED",
                                  data: result,
                                  draftKey: actionKey,
                                });
                                setPreview(null);
                                setMovePreview(null);
                                setOverlay(null);
                              },
                            )
                          }
                        >
                          Confirmar cambio global
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => setPreview(null)}
                        >
                          Volver a editar
                        </button>
                      </div>
                    </section>
                  )}
                  {overlay.kind === "DETAIL" && (
                    <div className={styles.detailFields}>
                      <p>
                        Cada campo se guarda por separado. Los demás borradores
                        permanecen intactos.
                      </p>
                      <section>
                        <h3>Importe o expresión</h3>
                        {valueEditor(node, "amount")}
                      </section>
                      <section>
                        <h3>Cantidad independiente</h3>
                        {valueEditor(node, "quantity")}
                      </section>
                    </div>
                  )}
                  {(overlay.kind === "DETAIL" || overlay.kind === "NOTE") && (
                    <NoteEditor
                      title="Nota del ítem"
                      saved={node.note ?? null}
                      limit={NOTE_LIMITS.item}
                      {...fieldProps(`note:${node.nodeId}`)}
                      canEdit={canEdit && !isArchived(node)}
                      onSave={(body) =>
                        saveField(
                          `note:${node.nodeId}`,
                          `items/${node.nodeId}/note`,
                          body,
                          `Nota · ${node.name}`,
                        )
                      }
                    />
                  )}
                  {(overlay.kind.startsWith("ZERO_") ||
                    overlay.kind.startsWith("CLEAR_")) && (
                    <>
                      <p>
                        {overlay.kind.startsWith("ZERO_")
                          ? "Se guardará un cero explícito."
                          : "El campo quedará SIN CARGAR, sin valor."}{" "}
                        Esta acción reemplaza el valor y el borrador de este
                        campo; los demás se conservan.
                      </p>
                      <button
                        className={styles.primary}
                        disabled={disabled}
                        onClick={() => {
                          const kind = overlay.kind.endsWith("AMOUNT")
                            ? "amount"
                            : "quantity";
                          const key =
                            kind === "amount"
                              ? node.nodeId
                              : `quantity:${node.nodeId}`;
                          void perform<StructureResponse>(
                            `items/${node.nodeId}/${kind}`,
                            "PUT",
                            {
                              expectedRevision: data.revision,
                              ...(overlay.kind.startsWith("ZERO_")
                                ? { state: "CARGADO", input: "0" }
                                : { state: "SIN_CARGAR" }),
                            },
                            key,
                            `${kind === "amount" ? "Importe" : "Cantidad"} · ${node.name}`,
                            (result) => {
                              dispatch({
                                type: "SAVED",
                                data: result,
                                draftKey: key,
                              });
                              setOverlay(null);
                            },
                          );
                        }}
                      >
                        Confirmar cambio
                      </button>
                    </>
                  )}
                </>
              )}
            </Modal>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}

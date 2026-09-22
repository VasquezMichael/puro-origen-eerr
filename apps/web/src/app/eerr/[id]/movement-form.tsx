"use client";
import {
  activeSiblings,
  financialRoot,
  movementParents,
  type StructureNode,
} from "@puro-origen/domain";
import type { CategoryMovePreviewResponse } from "@puro-origen/shared-types";
import styles from "../workspace.module.css";
export type MovementSelection = { parentId: string; position: number };
export function MovementForm({
  nodes,
  node,
  selection,
  onChange,
  preview,
  busy,
  disabled,
  incompatible,
  onSubmit,
  onConfirm,
  onBack,
  onClose,
}: {
  nodes: StructureNode[];
  node: StructureNode;
  selection: MovementSelection;
  onChange: (value: MovementSelection) => void;
  preview: CategoryMovePreviewResponse | null;
  busy: boolean;
  disabled: boolean;
  incompatible: boolean;
  onSubmit: () => void;
  onConfirm: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const category = node.kind === "CATEGORY",
    parents = movementParents(nodes, node.nodeId),
    parent = nodes.find((n) => n.nodeId === selection.parentId);
  const count = activeSiblings(nodes, selection.parentId).filter(
    (n) => n.nodeId !== node.nodeId && (!category || n.kind === "CATEGORY"),
  ).length;
  const root = financialRoot(nodes, node.nodeId);
  if (incompatible)
    return (
      <section>
        <p role="alert">
          Hay borradores pendientes en este ítem o subárbol, o cambios
          estructurales sin guardar. Guardalos o cancelalos en sus controles
          antes de mover. Ningún borrador se descartó.
        </p>
        <button onClick={onClose}>Continuar editando</button>
      </section>
    );
  return (
    <section>
      <p>Bloque: {root.name}</p>
      <p>
        Ubicación actual: {nodes.find((n) => n.nodeId === node.parentId)?.name}
      </p>
      {preview ? (
        <section aria-label="Vista previa del movimiento global">
          <h3>{preview.name}</h3>
          <p>
            {preview.from.name} · posición {preview.from.position + 1} →{" "}
            {preview.to.name} · posición {preview.to.position + 1}
          </p>
          <p>
            Período: {preview.month}/{preview.year} · {preview.block.name}
          </p>
          <p>
            <strong>{preview.affected} EERR afectados</strong>:{" "}
            {preview.initialized} preparados y {preview.uninitialized} sin
            preparar.
          </p>
          <p>{preview.warning}</p>
          <details>
            <summary>
              EERR accesibles afectados ({preview.accessibleEerrs.length})
            </summary>
            <ul>
              {preview.accessibleEerrs.map((id) => (
                <li key={id}>
                  <code className={styles.movementId}>{id}</code>
                </li>
              ))}
            </ul>
          </details>
          <p>
            Los EERR ajenos se incluyen solo en el conteo. La vista previa vence
            en cinco minutos.
          </p>
          {preview.noOp && (
            <p>
              La ubicación no cambia; no se modificarán revisiones ni timestamps
              del EERR.
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={disabled}
              onClick={onConfirm}
            >
              Confirmar movimiento global
            </button>
            <button disabled={busy} onClick={onBack}>
              Volver a editar
            </button>
          </div>
        </section>
      ) : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label>
            Nuevo padre
            <select
              value={selection.parentId}
              disabled={busy}
              onChange={(event) =>
                onChange({ parentId: event.target.value, position: 0 })
              }
            >
              {!parents.some((p) => p.nodeId === selection.parentId) && (
                <option value={selection.parentId}>
                  Destino ya no disponible
                </option>
              )}
              {parents.map((p) => (
                <option key={p.nodeId} value={p.nodeId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Posición {category ? "entre categorías" : "entre hermanos activos"}
            <select
              value={selection.position}
              disabled={busy}
              onChange={(event) =>
                onChange({ ...selection, position: Number(event.target.value) })
              }
            >
              {Array.from({ length: count + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
              {selection.position > count && (
                <option value={selection.position}>
                  {selection.position + 1} · fuera del rango actual
                </option>
              )}
            </select>
          </label>
          <p>
            {node.name} → {parent?.name ?? "Destino no disponible"} · posición{" "}
            {selection.position + 1}.{" "}
            {category
              ? "El subárbol se conserva y el cambio se publica para todas las sucursales del período."
              : "Solo cambiará este EERR; sus valores se conservan."}
          </p>
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={
                disabled ||
                selection.position > count ||
                !parents.some((p) => p.nodeId === selection.parentId)
              }
            >
              {category ? "Revisar movimiento global" : "Guardar movimiento"}
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

import {
  activeSiblings,
  compareNodes,
  isArchived,
  type StructureNode,
} from "@puro-origen/domain";
import type { StructureResponse } from "@puro-origen/shared-types";

export function visibleRows(
  nodes: StructureNode[],
  collapsed: ReadonlySet<string>,
) {
  const rows: { node: StructureNode; depth: number }[] = [];
  function visit(parent: string | null, depth: number) {
    for (const node of nodes
      .filter((n) => n.parentId === parent && !isArchived(n))
      .sort(compareNodes)) {
      rows.push({ node, depth });
      if (!collapsed.has(node.nodeId)) visit(node.nodeId, depth + 1);
    }
  }
  visit(null, 0);
  return rows;
}
export type NodeAction =
  | "MOVE_ITEM"
  | "MOVE_CATEGORY"
  | "UP"
  | "DOWN"
  | "ARCHIVE"
  | "RESTORE"
  | "DETAIL"
  | "RENAME_ITEM"
  | "NOTE"
  | "ZERO_AMOUNT"
  | "CLEAR_AMOUNT"
  | "ZERO_QUANTITY"
  | "CLEAR_QUANTITY"
  | "ITEM"
  | "CATEGORY"
  | "RENAME_CATEGORY";
export const actionLabels: Record<NodeAction, string> = {
  MOVE_ITEM: "Mover ítem",
  MOVE_CATEGORY: "Mover categoría",
  UP: "Subir",
  DOWN: "Bajar",
  ARCHIVE: "Archivar ítem",
  RESTORE: "Restaurar ítem",
  DETAIL: "Editar detalle",
  RENAME_ITEM: "Renombrar ítem",
  NOTE: "Editar nota",
  ZERO_AMOUNT: "Cargar cero en importe",
  CLEAR_AMOUNT: "Volver importe a sin cargar",
  ZERO_QUANTITY: "Cargar cero en cantidad",
  CLEAR_QUANTITY: "Volver cantidad a sin cargar",
  ITEM: "Agregar ítem",
  CATEGORY: "Agregar categoría global",
  RENAME_CATEGORY: "Renombrar categoría global",
};
export function nodeActions(
  kind: StructureNode["kind"],
  canEdit: boolean,
  archived = false,
): NodeAction[] {
  if (!canEdit) return [];
  if (kind === "ITEM" && archived) return ["RESTORE"];
  if (kind === "ITEM")
    return [
      "MOVE_ITEM",
      "UP",
      "DOWN",
      "DETAIL",
      "RENAME_ITEM",
      "NOTE",
      "ZERO_AMOUNT",
      "CLEAR_AMOUNT",
      "ZERO_QUANTITY",
      "CLEAR_QUANTITY",
      "ARCHIVE",
    ];
  return kind === "CATEGORY"
    ? ["ITEM", "CATEGORY", "RENAME_CATEGORY", "MOVE_CATEGORY", "UP", "DOWN"]
    : ["ITEM", "CATEGORY"];
}
export function mayEdit(
  user: {
    isAdmin: boolean;
    branchAccesses: { branchId: string; role: string }[];
  },
  branchId: string,
) {
  return (
    user.isAdmin ||
    user.branchAccesses.some(
      (a) =>
        a.branchId.toLowerCase() === branchId.toLowerCase() &&
        a.role === "EDITOR",
    )
  );
}
export function changedValue(draft: string | undefined, persisted: string) {
  return draft !== undefined && draft !== persisted;
}
export function pendingDraftCount(
  data: StructureResponse | null,
  drafts: Record<string, string>,
) {
  const saved: Record<string, string> = { "period-note": data?.note ?? "" };
  for (const node of data?.structure?.nodes ?? []) {
    saved[node.nodeId] = node.amount?.input ?? node.amount?.value ?? "";
    saved[`quantity:${node.nodeId}`] = node.quantity?.value ?? "";
    saved[`note:${node.nodeId}`] = node.note ?? "";
    saved[`name:${node.nodeId}`] = node.name;
    saved[`action:RENAME_CATEGORY:${node.nodeId}`] = node.name;
  }
  return Object.entries(drafts).filter(([key, value]) =>
    changedValue(value, saved[key] ?? ""),
  ).length;
}

/** Formatting only: no floating-point conversion or changes to monetary rules. */
export function formatAmount(value: string): string {
  const [integer, fraction] = value.split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction ?? "00"} ARS`;
}

export function movementRank(nodes: StructureNode[], node: StructureNode) {
  const siblings = activeSiblings(nodes, node.parentId).filter(
    (n) => node.kind !== "CATEGORY" || n.kind === "CATEGORY",
  );
  return {
    index: siblings.findIndex((n) => n.nodeId === node.nodeId),
    total: siblings.length,
  };
}
export function availableActions(
  nodes: StructureNode[],
  node: StructureNode,
  canEdit: boolean,
) {
  const { index, total } = movementRank(nodes, node);
  return nodeActions(node.kind, canEdit, isArchived(node)).filter((action) =>
    action === "UP" ? index > 0 : action === "DOWN" ? index < total - 1 : true,
  );
}
export function incompatibleMovementDrafts(
  data: StructureResponse,
  drafts: Record<string, string>,
  nodeId: string,
) {
  const nodes = data.structure?.nodes ?? [],
    ids = new Set([nodeId]);
  for (let i = 0; i < nodes.length; i++)
    for (const node of nodes)
      if (node.parentId && ids.has(node.parentId)) ids.add(node.nodeId);
  const relevant = Object.fromEntries(
    Object.entries(drafts).filter(([key]) => {
      if (key.startsWith("move:")) return false;
      return (
        key.startsWith("action:") ||
        [...ids].some((id) => key === id || key.endsWith(`:${id}`))
      );
    }),
  );
  return pendingDraftCount(data, relevant);
}

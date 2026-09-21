import type { StructureNode } from "@puro-origen/domain";
import type { StructureResponse } from "@puro-origen/shared-types";

export function visibleRows(
  nodes: StructureNode[],
  collapsed: ReadonlySet<string>,
) {
  const rows: { node: StructureNode; depth: number }[] = [];
  function visit(parent: string | null, depth: number) {
    for (const node of nodes
      .filter((n) => n.parentId === parent)
      .sort((a, b) => a.position - b.position)) {
      rows.push({ node, depth });
      if (!collapsed.has(node.nodeId)) visit(node.nodeId, depth + 1);
    }
  }
  visit(null, 0);
  return rows;
}
export type NodeAction =
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
): NodeAction[] {
  if (!canEdit) return [];
  if (kind === "ITEM")
    return [
      "DETAIL",
      "RENAME_ITEM",
      "NOTE",
      "ZERO_AMOUNT",
      "CLEAR_AMOUNT",
      "ZERO_QUANTITY",
      "CLEAR_QUANTITY",
    ];
  return kind === "CATEGORY"
    ? ["ITEM", "CATEGORY", "RENAME_CATEGORY"]
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

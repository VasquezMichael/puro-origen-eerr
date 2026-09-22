import {
  assertStructure,
  isArchived,
  type StructureNode,
} from "./eerr-structure.js";

/** Pure presentation order; never normalizes or mutates persisted positions on reads. */
export function compareNodes(a: StructureNode, b: StructureNode): number {
  return (
    a.position - b.position || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
  );
}
export function activeSiblings(
  nodes: StructureNode[],
  parentId: string | null,
): StructureNode[] {
  return nodes
    .filter((node) => node.parentId === parentId && !isArchived(node))
    .sort(compareNodes);
}
export function financialRoot(
  nodes: StructureNode[],
  nodeId: string,
): StructureNode {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const visited = new Set<string>();
  let node = byId.get(nodeId);
  while (node && node.parentId !== null) {
    if (visited.has(node.nodeId)) throw new Error("Ciclo en la estructura");
    visited.add(node.nodeId);
    node = byId.get(node.parentId);
  }
  if (!node || node.kind !== "BLOCK") throw new Error("Bloque no resoluble");
  return node;
}
/** Normalize active siblings only. Archived nodes retain their recovery position. */
export function normalizeActiveOrder(
  nodes: StructureNode[],
  parentId: string,
): void {
  activeSiblings(nodes, parentId).forEach((node, position) => {
    node.position = position;
  });
}
/** Position is a zero-based insertion index after removing the source. Blocks cannot move. */
export function moveNode(
  nodes: StructureNode[],
  nodeId: string,
  parentId: string,
  position: number,
) {
  assertStructure(nodes);
  const source = nodes.find((node) => node.nodeId === nodeId);
  const parent = nodes.find((node) => node.nodeId === parentId);
  if (!source || source.kind === "BLOCK" || isArchived(source))
    throw new Error("Nodo no movible");
  if (!parent || parent.kind === "ITEM")
    throw new Error("Padre inexistente o ITEM");
  if (financialRoot(nodes, nodeId).code !== financialRoot(nodes, parentId).code)
    throw new Error("No se permite mover entre bloques");
  let cursor: StructureNode | undefined = parent;
  while (cursor) {
    if (cursor.nodeId === source.nodeId)
      throw new Error("No se puede mover a sí mismo ni a un descendiente");
    cursor = nodes.find((node) => node.nodeId === cursor!.parentId);
  }
  const destination = activeSiblings(nodes, parentId).filter(
    (node) => node.nodeId !== nodeId,
  );
  if (
    !Number.isSafeInteger(position) ||
    position < 0 ||
    position > destination.length
  )
    throw new Error("Posición fuera de rango");
  const current = activeSiblings(nodes, source.parentId).findIndex(
    (node) => node.nodeId === nodeId,
  );
  if (source.parentId === parentId && current === position)
    return { nodes: structuredClone(nodes), changed: false };
  const result = structuredClone(nodes);
  const moved = result.find((node) => node.nodeId === nodeId)!;
  const oldParent = moved.parentId!;
  moved.parentId = parentId;
  const siblings = activeSiblings(result, parentId).filter(
    (node) => node.nodeId !== nodeId,
  );
  siblings.splice(position, 0, moved);
  siblings.forEach((node, index) => {
    node.position = index;
  });
  if (oldParent !== parentId) normalizeActiveOrder(result, oldParent);
  assertStructure(result);
  return { nodes: result, changed: true };
}

/** Category rank is relative to categories, never to branch-local items. */
export function moveCategory(
  nodes: StructureNode[],
  nodeId: string,
  parentId: string,
  rank: number,
) {
  const source = nodes.find((n) => n.nodeId === nodeId);
  if (!source || source.kind !== "CATEGORY")
    throw new Error("Categoría inexistente o bloque protegido");
  const categories = activeSiblings(nodes, parentId).filter(
    (n) => n.kind === "CATEGORY" && n.nodeId !== nodeId,
  );
  if (!Number.isSafeInteger(rank) || rank < 0 || rank > categories.length)
    throw new Error("Posición de categoría fuera de rango");
  const all = activeSiblings(nodes, parentId).filter(
    (n) => n.nodeId !== nodeId,
  );
  const insertion =
    rank < categories.length
      ? all.findIndex((n) => n.nodeId === categories[rank]!.nodeId)
      : categories.length
        ? all.findIndex(
            (n) => n.nodeId === categories[categories.length - 1]!.nodeId,
          ) + 1
        : all.length;
  // First validate ancestry, root and resulting subtree depth using the common movement rule.
  const moved = moveNode(nodes, nodeId, parentId, insertion);
  if (source.parentId !== parentId) return moved;
  const siblings = activeSiblings(nodes, parentId);
  const oldRank = siblings
    .filter((n) => n.kind === "CATEGORY")
    .findIndex((n) => n.nodeId === nodeId);
  if (rank === oldRank)
    return { nodes: structuredClone(nodes), changed: false };
  const ordered = [...categories];
  ordered.splice(rank, 0, source);
  const result = structuredClone(nodes);
  let categoryIndex = 0;
  siblings.forEach((node, position) => {
    const selected = node.kind === "CATEGORY" ? ordered[categoryIndex++] : node;
    result.find((n) => n.nodeId === selected!.nodeId)!.position = position;
  });
  assertStructure(result);
  return { nodes: result, changed: true };
}
export function restoreOrder(
  nodes: StructureNode[],
  nodeId: string,
): StructureNode[] {
  const result = structuredClone(nodes),
    node = result.find((n) => n.nodeId === nodeId);
  if (!node || !isArchived(node)) throw new Error("El ítem no está archivado");
  const parent = result.find((n) => n.nodeId === node.parentId);
  if (!parent || parent.kind === "ITEM") throw new Error("Padre no disponible");
  const siblings = activeSiblings(result, node.parentId);
  siblings.splice(Math.min(node.position, siblings.length), 0, node);
  node.archive = { ...node.archive!, state: "ACTIVE" };
  siblings.forEach((n, position) => {
    n.position = position;
  });
  assertStructure(result);
  return result;
}

export function movementParents(nodes: StructureNode[], nodeId: string) {
  const source = nodes.find((n) => n.nodeId === nodeId);
  if (!source || source.kind === "BLOCK" || isArchived(source)) return [];
  return nodes.filter((parent) => {
    if (parent.kind === "ITEM") return false;
    try {
      (source.kind === "CATEGORY" ? moveCategory : moveNode)(
        nodes,
        nodeId,
        parent.nodeId,
        0,
      );
      return true;
    } catch {
      return false;
    }
  });
}

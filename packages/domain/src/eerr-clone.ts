import {
  assertStructure,
  emptyAmount,
  isArchived,
  type EerrStructure,
  type StructureNode,
  type CategoryConcept,
  initialNodes,
} from "./eerr-structure.js";
import { emptyQuantity } from "./eerr-fields.js";
import { normalizeMoney } from "./money.js";
import { evaluateMoneyExpression } from "./money-expression.js";
import { activeSiblings } from "./eerr-order.js";

export type CloneMode = "ESTRUCTURA" | "ESTRUCTURA_Y_VALORES";

/** Validate the persisted result; evaluation is only a consistency check, never its replacement. */
export function assertCloneSource(structure: EerrStructure): void {
  if (
    structure.schemaVersion !== 1 ||
    !Number.isSafeInteger(structure.structureVersion) ||
    structure.structureVersion < 0
  )
    throw new Error("Versión de estructura incompatible");
  if (
    !Number.isFinite(Date.parse(structure.initializedAt)) ||
    !structure.initializedBy
  )
    throw new Error("Metadata de inicialización inválida");
  assertStructure(structure.nodes);
  for (const node of structure.nodes) {
    if (!["BLOCK", "CATEGORY", "ITEM"].includes(node.kind))
      throw new Error("Tipo de nodo inválido");
    if (node.kind !== "ITEM") continue;
    const amount = node.amount!;
    if (amount.state === "CARGADO") {
      if (normalizeMoney(amount.value!) !== amount.value)
        throw new Error("Importe persistido inválido");
      if (
        amount.input !== null &&
        evaluateMoneyExpression(amount.input).value !== amount.value
      )
        throw new Error("La expresión y el resultado del origen no coinciden");
    }
  }
}

export function cloneSourceCounts(nodes: StructureNode[]) {
  const items = nodes.filter(
    (node) => node.kind === "ITEM" && !isArchived(node),
  );
  return {
    blocks: nodes
      .filter((node) => node.kind === "BLOCK")
      .map((node) => node.name),
    categories: nodes.filter((node) => node.kind === "CATEGORY").length,
    items: items.length,
    loadedAmounts: items.filter((node) => node.amount!.state === "CARGADO")
      .length,
    loadedQuantities: items.filter((node) => node.quantity?.state === "CARGADO")
      .length,
    zeroAmounts: items.filter(
      (node) =>
        node.amount!.state === "CARGADO" && node.amount!.value === "0.00",
    ).length,
    zeroQuantities: items.filter(
      (node) =>
        node.quantity?.state === "CARGADO" && node.quantity.value === "0",
    ).length,
    unloadedAmounts: items.filter((node) => node.amount!.state === "SIN_CARGAR")
      .length,
    unloadedQuantities: items.filter(
      (node) => !node.quantity || node.quantity.state === "SIN_CARGAR",
    ).length,
  };
}

/** Explicit allowlist: no source audit fields, notes, archive metadata or internal references. */
export function cloneActiveNodes(
  structure: EerrStructure,
  mode: CloneMode,
  uuid: () => string,
): StructureNode[] {
  assertCloneSource(structure);
  if (mode !== "ESTRUCTURA" && mode !== "ESTRUCTURA_Y_VALORES")
    throw new Error("Modo inválido");
  const active = structure.nodes.filter((node) => !isArchived(node));
  const ids = new Map(active.map((node) => [node.nodeId, uuid()]));
  const result: StructureNode[] = active.map((node) => ({
    nodeId: ids.get(node.nodeId)!,
    code: node.code,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId === null ? null : ids.get(node.parentId)!,
    position: node.position,
    ...(node.kind === "ITEM"
      ? {
          amount:
            mode === "ESTRUCTURA_Y_VALORES"
              ? structuredClone(node.amount!)
              : emptyAmount(),
          quantity:
            mode === "ESTRUCTURA_Y_VALORES"
              ? structuredClone(node.quantity ?? emptyQuantity())
              : emptyQuantity(),
          ...(node.unit === undefined ? {} : { unit: node.unit }),
          ...(node.quantityEnabled === undefined
            ? {}
            : { quantityEnabled: node.quantityEnabled }),
        }
      : {}),
  }));
  for (const parent of result.filter((node) => node.kind !== "ITEM"))
    activeSiblings(result, parent.nodeId).forEach((node, position) => {
      node.position = position;
    });
  assertStructure(result);
  return result;
}

export function cloneCategories(nodes: StructureNode[]): CategoryConcept[] {
  return nodes
    .filter((n) => n.kind === "CATEGORY")
    .map((node) => ({
      code: node.code,
      name: node.name,
      parentCode: nodes.find((n) => n.nodeId === node.parentId)!.code,
      position: activeSiblings(nodes, node.parentId)
        .filter((n) => n.kind === "CATEGORY")
        .findIndex((n) => n.nodeId === node.nodeId),
    }));
}
/** Existing destination categories, names and category order are authoritative. */
export function prepareCloneNodes(
  source: EerrStructure,
  mode: CloneMode,
  template: CategoryConcept[] | null,
  uuid: () => string,
) {
  const copied = cloneActiveNodes(source, mode, uuid),
    required = cloneCategories(source.nodes);
  const categories = template === null ? required : structuredClone(template);
  const codes = new Set<string>(),
    positions = new Set<string>();
  for (const category of categories) {
    const key = `${category.parentCode}:${category.position}`;
    if (
      codes.has(category.code) ||
      positions.has(key) ||
      !Number.isSafeInteger(category.position) ||
      category.position < 0
    )
      throw new Error("Plantilla con códigos o posiciones inválidos");
    codes.add(category.code);
    positions.add(key);
  }
  const base = initialNodes(categories, uuid);
  for (const category of required) {
    const target = categories.find((c) => c.code === category.code);
    if (!target)
      throw new Error(`Categoría requerida ausente: ${category.name}`);
    if (target.parentCode !== category.parentCode)
      throw new Error(`Parentesco o bloque incompatible: ${category.name}`);
  }
  const byCode = new Map(base.map((node) => [node.code, node]));
  const items = copied
    .filter((n) => n.kind === "ITEM")
    .map((node) => {
      if (byCode.has(node.code))
        throw new Error("Código de ítem utilizado por una categoría destino");
      const oldParent = copied.find((n) => n.nodeId === node.parentId)!;
      const parent = byCode.get(oldParent.code);
      if (!parent) throw new Error("Padre de ítem ausente");
      return { ...node, parentId: parent.nodeId };
    });
  // Reuse category slots in the source sequence, then append additional destination categories.
  // Items keep their relative order; the complete destination template retains its category order.
  for (const parent of base) {
    const original = source.nodes.find((n) => n.code === parent.code);
    const targetCategories = activeSiblings(base, parent.nodeId),
      siblings: StructureNode[] = [];
    let index = 0;
    if (original)
      for (const node of activeSiblings(source.nodes, original.nodeId)) {
        if (node.kind === "CATEGORY") {
          const next = targetCategories[index++];
          if (next) siblings.push(next);
        } else {
          const item = items.find((n) => n.code === node.code);
          if (item) siblings.push(item);
        }
      }
    siblings.push(...targetCategories.slice(index));
    siblings.forEach((node, position) => {
      node.position = position;
    });
  }
  const nodes = [...base, ...items];
  assertStructure(nodes);
  return { nodes, categories, seedTemplate: template === null };
}

import {
  normalizeQuantity,
  normalizeNote,
  NOTE_LIMITS,
  type QuantityCell,
} from "./eerr-fields.js";
export const ROOTS = [
  { code: "00000000-0000-4000-8000-000000000001", name: "INGRESOS" },
  { code: "00000000-0000-4000-8000-000000000002", name: "COSTOS" },
  { code: "00000000-0000-4000-8000-000000000003", name: "GASTOS GENERALES" },
] as const;
export const STRUCTURE_LIMITS = {
  nodes: 1000,
  depth: 12,
  name: 120,
  periodEerrs: 200,
} as const;
export type AmountCell = {
  state: "SIN_CARGAR" | "CARGADO";
  input: string | null;
  value: string | null;
  currency: "ARS";
  scale: 2;
};
export type StructureNode = {
  nodeId: string;
  code: string;
  parentId: string | null;
  position: number;
  name: string;
  kind: "BLOCK" | "CATEGORY" | "ITEM";
  amount?: AmountCell;
  quantityEnabled?: boolean;
  quantity?: QuantityCell;
  note?: string | null;
  unit?: string | null;
  archive?: { state: "ACTIVE" | "ARCHIVED"; at: string; by: string };
};
/** Legacy nodes without archive metadata remain active. */
export function isArchived(node: StructureNode): boolean {
  return node.kind === "ITEM" && node.archive?.state === "ARCHIVED";
}
export type CategoryConcept = {
  code: string;
  parentCode: string;
  name: string;
  position: number;
};
export type EerrStructure = {
  schemaVersion: number;
  structureVersion: number;
  initializedAt: string;
  initializedBy: string;
  nodes: StructureNode[];
};
export function cleanConceptName(value: string): string {
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!name || name.length > STRUCTURE_LIMITS.name)
    throw new Error("Nombre obligatorio de hasta 120 caracteres");
  return name;
}
export function conceptNameKey(value: string): string {
  return cleanConceptName(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
export function emptyAmount(): AmountCell {
  return {
    state: "SIN_CARGAR",
    input: null,
    value: null,
    currency: "ARS",
    scale: 2,
  };
}
export function loadProgress(nodes: StructureNode[]) {
  const items = nodes.filter(
    (node) => node.kind === "ITEM" && !isArchived(node),
  );
  const loaded = items.filter(
    (node) => node.amount?.state === "CARGADO",
  ).length;
  return {
    total: items.length,
    loaded,
    pending: items.length - loaded,
    status:
      loaded === 0
        ? ("SIN_CARGAR" as const)
        : loaded === items.length
          ? ("CARGADO" as const)
          : ("PARCIAL" as const),
  };
}
export function assertStructure(nodes: StructureNode[]): void {
  if (nodes.length > STRUCTURE_LIMITS.nodes)
    throw new Error("Se alcanzó el límite de nodos");
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  if (
    byId.size !== nodes.length ||
    new Set(nodes.map((node) => node.code)).size !== nodes.length
  )
    throw new Error("Identidades duplicadas");
  const uuid =
    /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
  const siblings = new Set<string>();
  const positions = new Set<string>();
  for (const node of nodes) {
    if (
      node.archive &&
      (node.kind !== "ITEM" ||
        !["ACTIVE", "ARCHIVED"].includes(node.archive.state) ||
        !Number.isFinite(Date.parse(node.archive.at)) ||
        !node.archive.by)
    )
      throw new Error("Estado de archivo inválido");
    if (!uuid.test(node.code) || !uuid.test(node.nodeId))
      throw new Error("Identidad inválida");
    cleanConceptName(node.name);
    if (!Number.isSafeInteger(node.position) || node.position < 0)
      throw new Error("Posición inválida");
    const root = ROOTS.find((item) => item.code === node.code);
    if (node.kind === "BLOCK") {
      if (
        !root ||
        node.parentId !== null ||
        node.name !== root.name ||
        node.position !== ROOTS.indexOf(root)
      )
        throw new Error("Bloque protegido");
    } else {
      if (root || node.parentId === null)
        throw new Error("Código reservado o raíz inválida");
      const parent = byId.get(node.parentId);
      if (!parent || parent.kind === "ITEM")
        throw new Error("Padre inexistente o ITEM");
    }
    const key = `${node.parentId}:${conceptNameKey(node.name)}`;
    const position = `${node.parentId}:${node.position}`;
    if (siblings.has(key) || positions.has(position))
      throw new Error("Nombre o posición duplicado entre hermanos");
    siblings.add(key);
    positions.add(position);
    let cursor: StructureNode | undefined = node;
    const path = new Set<string>();
    while (cursor) {
      if (path.has(cursor.nodeId) || path.size >= STRUCTURE_LIMITS.depth)
        throw new Error("Ciclo o profundidad excesiva");
      path.add(cursor.nodeId);
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    if (node.kind === "ITEM") {
      const cell = node.amount;
      if (
        !cell ||
        cell.currency !== "ARS" ||
        cell.scale !== 2 ||
        (cell.state === "SIN_CARGAR"
          ? cell.value !== null || cell.input !== null
          : cell.state !== "CARGADO" ||
            cell.value === null ||
            !/^\d+\.\d{2}$/.test(cell.value))
      )
        throw new Error("Celda inválida");
      if (node.quantity) {
        const quantity = node.quantity;
        if (
          quantity.state === "SIN_CARGAR"
            ? quantity.value !== null
            : quantity.state !== "CARGADO" ||
              quantity.value === null ||
              normalizeQuantity(quantity.value) !== quantity.value
        )
          throw new Error("Cantidad inválida");
      }
      if (node.note != null) normalizeNote(node.note, NOTE_LIMITS.item);
    } else if (node.amount !== undefined)
      throw new Error("Solo ITEM admite importe");
  }
  if (nodes.filter((node) => node.kind === "BLOCK").length !== ROOTS.length)
    throw new Error("Se requieren exactamente tres bloques");
}

/** Conserva instancias, ítems y valores; solo publica categorías por código. */
export function applyCategories(
  nodes: StructureNode[],
  categories: CategoryConcept[],
  uuid: () => string,
): StructureNode[] {
  const result = structuredClone(nodes);
  for (const category of categories) {
    const existing = result.find((node) => node.code === category.code);
    const parent = result.find((node) => node.code === category.parentCode);
    if (!parent || parent.kind === "ITEM")
      throw new Error("Padre global inválido");
    if (existing) {
      if (existing.kind !== "CATEGORY" || existing.parentId !== parent.nodeId)
        throw new Error("Identidad global incompatible");
      existing.name = category.name;
    } else
      result.push({
        nodeId: uuid(),
        code: category.code,
        parentId: parent.nodeId,
        kind: "CATEGORY",
        name: category.name,
        position:
          Math.max(
            -1,
            ...result
              .filter((node) => node.parentId === parent.nodeId)
              .map((node) => node.position),
          ) + 1,
      });
  }
  assertStructure(result);
  return result;
}
export function initialNodes(
  categories: CategoryConcept[],
  uuid: () => string,
): StructureNode[] {
  return applyCategories(
    ROOTS.map((root, position) => ({
      ...root,
      position,
      nodeId: uuid(),
      parentId: null,
      kind: "BLOCK",
    })),
    categories,
    uuid,
  );
}

import {
  assertStructure,
  emptyAmount,
  isArchived,
  type AmountCell,
  type EerrStructure,
} from "./eerr-structure.js";
import {
  emptyQuantity,
  normalizeQuantity,
  type QuantityCell,
} from "./eerr-fields.js";
import { evaluateMoneyExpression } from "./money-expression.js";

export const IMPORT_LIMITS = {
  fileBytes: 2 * 1024 * 1024,
  expandedBytes: 12 * 1024 * 1024,
  sheets: 2,
  rows: 1000,
  cell: 2048,
  operations: 2000,
  entries: 64,
} as const;
export const IMPORT_COLUMNS = [
  "eerr_id",
  "revision_estructura",
  "codigo_item",
  "item",
  "ruta",
  "importe_o_expresion",
  "cantidad",
] as const;
export type ImportRow = {
  row: number;
  code: string;
  amount: string;
  quantity: string;
  amountIssue?: string;
};
export type ImportIssue = { row: number; field: string; message: string };
export type ImportChange = {
  code: string;
  nodeId: string;
  amount?: AmountCell;
  quantity?: QuantityCell;
};
export type ImportRowPreview = {
  row: number;
  code: string;
  name: string;
  before: { amount: AmountCell; quantity: QuantityCell };
  after: { amount: AmountCell; quantity: QuantityCell };
  changed: ("amount" | "quantity")[];
};

/** Compatibility identity excludes item display names and all editable values/notes.
 * The existing structureVersion also advances on rename and misses archive, so it alone is insufficient. */
export function importStructureIdentity(structure: EerrStructure): string {
  assertStructure(structure.nodes);
  return JSON.stringify({
    schemaVersion: structure.schemaVersion,
    initializedAt: structure.initializedAt,
    nodes: [...structure.nodes]
      .sort((a, b) => (a.code < b.code ? -1 : 1))
      .map((n) => ({
        code: n.code,
        nodeId: n.nodeId,
        kind: n.kind,
        parentId: n.parentId,
        position: n.position,
        name: n.kind === "ITEM" ? undefined : n.name,
        archive: n.archive,
        unit: n.unit,
        quantityEnabled: n.quantityEnabled,
      })),
  });
}
export function importPlan(structure: EerrStructure, rows: ImportRow[]) {
  assertStructure(structure.nodes);
  if (!rows.length || rows.length > IMPORT_LIMITS.rows)
    throw new Error("El archivo debe contener entre 1 y 1000 filas de carga");
  const issues: ImportIssue[] = [],
    preview: ImportRowPreview[] = [],
    changes: ImportChange[] = [],
    seen = new Set<string>();
  let changedFields = 0,
    unchangedFields = 0;
  for (const row of rows) {
    const code = row.code.trim().toLowerCase();
    const issue = (field: string, message: string) =>
      issues.push({ row: row.row, field, message });
    if (row.amountIssue) issue("importe_o_expresion", row.amountIssue);
    if (!code) {
      issue("codigo_item", "Código vacío");
      continue;
    }
    if (seen.has(code)) {
      issue("codigo_item", "Código duplicado");
      continue;
    }
    seen.add(code);
    const node = structure.nodes.find(
      (n) => n.code === code && n.kind === "ITEM",
    );
    if (!node) {
      issue("codigo_item", "Código de ítem desconocido en este EERR");
      continue;
    }
    if (isArchived(node)) {
      issue("codigo_item", "El ítem está archivado; no se puede importar");
      continue;
    }
    const before = {
      amount: structuredClone(node.amount!),
      quantity: structuredClone(node.quantity ?? emptyQuantity()),
    };
    const after = structuredClone(before),
      changed: ImportRowPreview["changed"] = [];
    const change: ImportChange = { code, nodeId: node.nodeId };
    for (const field of ["amount", "quantity"] as const) {
      if (field === "amount" && row.amountIssue) {
        continue;
      }
      const input = row[field].trim();
      if (!input) {
        unchangedFields++;
        continue;
      }
      try {
        if (input.length > IMPORT_LIMITS.cell)
          throw new Error("Celda demasiado extensa");
        if (input.startsWith("="))
          throw new Error(
            "No se admiten fórmulas de Excel; escribí la expresión como texto sin =",
          );
        if (field === "amount")
          after.amount =
            input.toUpperCase() === "SIN_CARGAR"
              ? emptyAmount()
              : {
                  state: "CARGADO",
                  ...evaluateMoneyExpression(input),
                  currency: "ARS",
                  scale: 2,
                };
        else
          after.quantity =
            input.toUpperCase() === "SIN_CARGAR"
              ? emptyQuantity()
              : { state: "CARGADO", value: normalizeQuantity(input) };
        if (
          before[field].state === after[field].state &&
          before[field].value === after[field].value &&
          (field !== "amount" || before.amount.input === after.amount.input)
        )
          unchangedFields++;
        else {
          changed.push(field);
          changedFields++;
          if (field === "amount") change.amount = after.amount;
          else change.quantity = after.quantity;
        }
      } catch (error) {
        issue(
          field === "amount" ? "importe_o_expresion" : "cantidad",
          error instanceof Error ? error.message : "Valor inválido",
        );
      }
    }
    preview.push({
      row: row.row,
      code,
      name: node.name,
      before,
      after,
      changed,
    });
    if (changed.length) changes.push(change);
  }
  if (changedFields > IMPORT_LIMITS.operations)
    throw new Error("Demasiadas operaciones");
  return {
    rows: preview,
    issues,
    changes,
    readRows: rows.length,
    changedFields,
    unchangedFields,
    affectedItems: changes.length,
  };
}

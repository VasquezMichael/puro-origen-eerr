import {
  assertStructure,
  emptyAmount,
  isArchived,
  loadProgress,
  type AmountCell,
  type EerrStructure,
} from "./eerr-structure.js";
import { activeSiblings } from "./eerr-order.js";

export function completePendingPlan(structure: EerrStructure) {
  assertStructure(structure.nodes);
  const before = loadProgress(structure.nodes);
  const affected: {
    nodeId: string;
    code: string;
    name: string;
    block: string;
    path: string;
  }[] = [];
  const visit = (parentId: string | null, ancestors: string[]) => {
    for (const node of activeSiblings(structure.nodes, parentId)) {
      if (node.kind === "ITEM") {
        if (!isArchived(node) && node.amount!.state === "SIN_CARGAR")
          affected.push({
            nodeId: node.nodeId,
            code: node.code,
            name: node.name,
            block: ancestors[0]!,
            path: ancestors.join(" / "),
          });
      } else visit(node.nodeId, [...ancestors, node.name]);
    }
  };
  visit(null, []);
  const changes = affected.map(({ nodeId, code }) => ({
    nodeId,
    code,
    amount: {
      ...emptyAmount(),
      state: "CARGADO",
      value: "0.00",
      input: null,
    } as AmountCell,
  }));
  const amounts = new Map(changes.map((c) => [c.nodeId, c.amount]));
  const after = loadProgress(
    structure.nodes.map((n) =>
      amounts.has(n.nodeId) ? { ...n, amount: amounts.get(n.nodeId)! } : n,
    ),
  );
  return { before, after, affected, changes };
}

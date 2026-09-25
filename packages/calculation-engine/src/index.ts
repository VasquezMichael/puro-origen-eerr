import {
  assertStructure,
  compareNodes,
  isArchived,
  MONEY,
  ROOTS,
  STRUCTURE_LIMITS,
  type EerrStructure,
  type SalesGoalValue,
  type StructureNode,
} from "@puro-origen/domain";

export const CALCULATION_VERSION = 2;
export type ScopeStatus = "EMPTY" | "PENDING" | "PARTIAL" | "COMPLETE";
export type MetricStatus = "COMPLETE" | "BLOCKED" | "NOT_CALCULABLE";
export type MetricReason =
  | "UNINITIALIZED"
  | "PENDING_INPUTS"
  | "EMPTY_INPUT"
  | "ZERO_DENOMINATOR"
  | "ZERO_REVENUE"
  | "NON_POSITIVE_CONTRIBUTION_MARGIN"
  | "GOAL_NOT_CONFIGURED"
  | "TARGET_MARGIN_UNATTAINABLE";
export type Completeness = {
  loadedCount: number;
  pendingCount: number;
  totalCount: number;
  completenessPercent: string | null;
};
export type ScopeResult = {
  nodeId: string;
  code: string;
  name: string;
  status: ScopeStatus;
  value: string | null;
  completeness: Completeness;
};
export type CategoryResult = ScopeResult & {
  parentNodeId: string;
  parentCode: string;
  depth: number;
  position: number;
};
export type MetricResult = {
  status: MetricStatus;
  value: string | null;
  unit: "ARS" | "PERCENT";
  reason: MetricReason | null;
};
export type ReferenceResult = MetricResult & {
  type: SalesGoalValue["mode"] | null;
};
export type AnalysisCalculation = {
  calculationVersion: typeof CALCULATION_VERSION;
  initialized: boolean;
  currency: typeof MONEY.currency;
  blocks: ScopeResult[];
  categories: CategoryResult[];
  metrics: {
    grossMargin: MetricResult;
    grossMarginPercent: MetricResult;
    netResult: MetricResult;
    netResultPercent: MetricResult;
  };
  projections: {
    breakEvenSales: MetricResult;
    targetSales: MetricResult;
    targetReference: ReferenceResult;
  };
};

type Accumulator = { total: number; loaded: number; cents: bigint };
const emptyAccumulator = (): Accumulator => ({
  total: 0,
  loaded: 0,
  cents: 0n,
});
const maximumCellCents = BigInt(MONEY.max.replace(".", ""));

/** Redondeo HALF_UP en la magnitud: también respeta empates negativos. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Denominador inválido");
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const rounded =
    quotient + (2n * (magnitude % denominator) >= denominator ? 1n : 0n);
  return numerator < 0n ? -rounded : rounded;
}

function fixed(value: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale);
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${magnitude / factor}.${(magnitude % factor).toString().padStart(scale, "0")}`;
}

/** Techo de un racional no negativo, sin conversión a Number. */
function divideCeiling(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n)
    throw new Error("Proyección inválida");
  return numerator / denominator + (numerator % denominator === 0n ? 0n : 1n);
}

function projectionReason(
  scopes: ScopeResult[],
  income: bigint,
  contribution: bigint,
): MetricReason | null {
  if (
    scopes.some(
      (scope) => scope.status === "PENDING" || scope.status === "PARTIAL",
    )
  )
    return "PENDING_INPUTS";
  if (scopes.some((scope) => scope.status === "EMPTY")) return "EMPTY_INPUT";
  if (income === 0n) return "ZERO_REVENUE";
  if (contribution <= 0n) return "NON_POSITIVE_CONTRIBUTION_MARGIN";
  return null;
}

function projections(
  scopes: ScopeResult[] | null,
  income: bigint,
  contribution: bigint,
  expenses: bigint,
  goal: SalesGoalValue | null,
): AnalysisCalculation["projections"] {
  const reason =
    scopes === null
      ? "UNINITIALIZED"
      : projectionReason(scopes, income, contribution);
  const referenceType =
    goal?.mode === "NET_MARGIN_PERCENT"
      ? "NET_PROFIT_AMOUNT"
      : goal?.mode === "NET_PROFIT_AMOUNT"
        ? "NET_MARGIN_PERCENT"
        : null;
  const blockedReference = (why: MetricReason): ReferenceResult => ({
    ...blocked(referenceType === "NET_MARGIN_PERCENT" ? "PERCENT" : "ARS", why),
    type: referenceType,
  });
  if (reason)
    return {
      breakEvenSales: blocked("ARS", reason),
      targetSales: blocked("ARS", reason),
      targetReference: blockedReference(reason),
    };
  const breakEvenSales = monetary(
    divideCeiling(expenses * income, contribution),
  );
  if (goal === null)
    return {
      breakEvenSales,
      targetSales: blocked("ARS", "GOAL_NOT_CONFIGURED"),
      targetReference: blockedReference("GOAL_NOT_CONFIGURED"),
    };
  let targetCents: bigint;
  if (goal.mode === "NET_MARGIN_PERCENT") {
    if (!/^\d{1,2}\.\d{4}$/.test(goal.value))
      throw new Error("Meta persistida inválida");
    const percentUnits = BigInt(goal.value.replace(".", ""));
    const denominator = contribution * 1000000n - income * percentUnits;
    if (denominator <= 0n)
      return {
        breakEvenSales,
        targetSales: blocked("ARS", "TARGET_MARGIN_UNATTAINABLE"),
        targetReference: blockedReference("TARGET_MARGIN_UNATTAINABLE"),
      };
    targetCents = divideCeiling(expenses * income * 1000000n, denominator);
    return {
      breakEvenSales,
      targetSales: monetary(targetCents),
      targetReference: {
        ...monetary(divideRounded(targetCents * percentUnits, 1000000n)),
        type: referenceType,
      },
    };
  }
  const amount = centsOf(goal.value);
  targetCents = divideCeiling((expenses + amount) * income, contribution);
  return {
    breakEvenSales,
    targetSales: monetary(targetCents),
    targetReference:
      targetCents === 0n
        ? {
            ...blocked("PERCENT", "ZERO_DENOMINATOR"),
            status: "NOT_CALCULABLE",
            type: referenceType,
          }
        : { ...percentage(amount, targetCents), type: referenceType },
  };
}

function centsOf(value: string): bigint {
  if (!/^\d+\.\d{2}$/.test(value))
    throw new Error("Importe persistido inválido");
  const cents = BigInt(value.replace(".", ""));
  if (cents > maximumCellCents || fixed(cents, 2) !== value)
    throw new Error("Importe persistido fuera de rango o no canónico");
  return cents;
}

function completeness(acc: Accumulator): Completeness {
  return {
    loadedCount: acc.loaded,
    pendingCount: acc.total - acc.loaded,
    totalCount: acc.total,
    completenessPercent:
      acc.total === 0
        ? null
        : fixed(
            divideRounded(BigInt(acc.loaded) * 10000n, BigInt(acc.total)),
            2,
          ),
  };
}

function scope(node: StructureNode, acc: Accumulator): ScopeResult {
  const status: ScopeStatus =
    acc.total === 0
      ? "EMPTY"
      : acc.loaded === 0
        ? "PENDING"
        : acc.loaded < acc.total
          ? "PARTIAL"
          : "COMPLETE";
  return {
    nodeId: node.nodeId,
    code: node.code,
    name: node.name,
    status,
    value: acc.loaded === 0 ? null : fixed(acc.cents, 2),
    completeness: completeness(acc),
  };
}

function blocked(
  unit: MetricResult["unit"],
  reason: MetricReason,
): MetricResult {
  return { status: "BLOCKED", value: null, unit, reason };
}
function monetary(value: bigint): MetricResult {
  return {
    status: "COMPLETE",
    value: fixed(value, 2),
    unit: "ARS",
    reason: null,
  };
}
function percentage(numerator: bigint, denominator: bigint): MetricResult {
  if (denominator === 0n)
    return {
      status: "NOT_CALCULABLE",
      value: null,
      unit: "PERCENT",
      reason: "ZERO_DENOMINATOR",
    };
  return {
    status: "COMPLETE",
    value: fixed(divideRounded(numerator * 1000000n, denominator), 4),
    unit: "PERCENT",
    reason: null,
  };
}

function unavailable(scopes: ScopeResult[]): MetricReason | null {
  if (scopes.some((item) => item.status === "EMPTY")) return "EMPTY_INPUT";
  if (scopes.some((item) => item.status !== "COMPLETE"))
    return "PENDING_INPUTS";
  return null;
}

/** Calcula únicamente sobre valores persistidos del snapshot; no modifica la entrada. */
export function calculateEerr(
  structure: EerrStructure | null,
  goal: SalesGoalValue | null = null,
): AnalysisCalculation {
  if (structure === null) {
    return {
      calculationVersion: CALCULATION_VERSION,
      initialized: false,
      currency: MONEY.currency,
      blocks: [],
      categories: [],
      metrics: {
        grossMargin: blocked("ARS", "UNINITIALIZED"),
        grossMarginPercent: blocked("PERCENT", "UNINITIALIZED"),
        netResult: blocked("ARS", "UNINITIALIZED"),
        netResultPercent: blocked("PERCENT", "UNINITIALIZED"),
      },
      projections: projections(null, 0n, 0n, 0n, goal),
    };
  }
  if (
    structure.schemaVersion !== 1 ||
    structure.nodes.length > STRUCTURE_LIMITS.nodes
  )
    throw new Error("Versión o tamaño de snapshot inválido");
  assertStructure(structure.nodes);
  const byId = new Map(structure.nodes.map((node) => [node.nodeId, node]));
  const accumulated = new Map(
    structure.nodes.map((node) => [node.nodeId, emptyAccumulator()]),
  );
  for (const item of structure.nodes) {
    if (item.kind !== "ITEM" || isArchived(item)) continue;
    const cell = item.amount!;
    const cents = cell.state === "CARGADO" ? centsOf(cell.value!) : 0n;
    let parentId = item.parentId;
    while (parentId !== null) {
      const acc = accumulated.get(parentId)!;
      acc.total++;
      if (cell.state === "CARGADO") {
        acc.loaded++;
        acc.cents += cents;
      }
      parentId = byId.get(parentId)!.parentId;
    }
  }
  const blocks = ROOTS.map((root) => {
    const node = structure.nodes.find(
      (candidate) => candidate.code === root.code,
    )!;
    return scope(node, accumulated.get(node.nodeId)!);
  });
  const categories: CategoryResult[] = [];
  function visit(parent: StructureNode, depth: number): void {
    const children = structure!.nodes
      .filter(
        (node) => node.parentId === parent.nodeId && node.kind === "CATEGORY",
      )
      .sort(compareNodes);
    for (const child of children) {
      categories.push({
        ...scope(child, accumulated.get(child.nodeId)!),
        parentNodeId: parent.nodeId,
        parentCode: parent.code,
        depth,
        position: child.position,
      });
      visit(child, depth + 1);
    }
  }
  for (const block of blocks) visit(byId.get(block.nodeId)!, 1);
  const [income, cost, expense] = blocks as [
    ScopeResult,
    ScopeResult,
    ScopeResult,
  ];
  const incomeCents = accumulated.get(income.nodeId)!.cents;
  const grossCents = incomeCents - accumulated.get(cost.nodeId)!.cents;
  const expenseCents = accumulated.get(expense.nodeId)!.cents;
  const netCents = grossCents - expenseCents;
  const grossReason = unavailable([income, cost]);
  const netReason = unavailable([income, cost, expense]);
  const grossMargin = grossReason
    ? blocked("ARS", grossReason)
    : monetary(grossCents);
  const netResult = netReason ? blocked("ARS", netReason) : monetary(netCents);
  return {
    calculationVersion: CALCULATION_VERSION,
    initialized: true,
    currency: MONEY.currency,
    blocks,
    categories,
    projections: projections(
      [income, cost, expense],
      incomeCents,
      grossCents,
      expenseCents,
      goal,
    ),
    metrics: {
      grossMargin,
      grossMarginPercent: grossReason
        ? blocked("PERCENT", grossReason)
        : percentage(grossCents, incomeCents),
      netResult,
      netResultPercent: netReason
        ? blocked("PERCENT", netReason)
        : percentage(netCents, incomeCents),
    },
  };
}

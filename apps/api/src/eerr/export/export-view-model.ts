import {
  calculateEerr,
  type AnalysisCalculation,
} from '@puro-origen/calculation-engine';
import {
  compareNodes,
  isArchived,
  type EerrStructure,
  type StructureNode,
  type SalesGoalValue,
} from '@puro-origen/domain';
import type { EerrLoadStatus } from '../schemas/eerr.schema.js';

export type ExportValue = {
  status: string;
  value: string | null;
  reason?: string | null;
};
export type ExportRow = {
  kind: StructureNode['kind'];
  label: string;
  depth: number;
  amount: ExportValue;
  quantity: ExportValue | null;
  unit: string | null;
  note: string | null;
};
export type ExportIndicator = {
  label: string;
  unit: 'ARS' | 'PERCENT' | 'TRAFFIC_LIGHT';
  result: ExportValue;
};
export type EerrExportViewModel = {
  branchName: string;
  year: number;
  month: number;
  lifecycleStatus: 'OPEN' | 'CLOSED';
  loadStatus: EerrLoadStatus;
  revision: number;
  periodNote: string | null;
  rows: ExportRow[];
  indicators: ExportIndicator[];
  analysis: AnalysisCalculation;
};

/** Pure projection of one authorized, immutable-in-memory EERR snapshot. */
export function buildEerrExportViewModel(input: {
  branchName: string;
  year: number;
  month: number;
  lifecycleStatus: 'OPEN' | 'CLOSED';
  loadStatus: EerrLoadStatus;
  revision: number;
  periodNote: string | null;
  structure: EerrStructure | null;
  salesGoal: SalesGoalValue | null;
}): EerrExportViewModel {
  const analysis = calculateEerr(input.structure, input.salesGoal);
  const rows: ExportRow[] = [];
  if (input.structure) {
    const groups = new Map<string | null, StructureNode[]>();
    for (const node of input.structure.nodes) {
      if (isArchived(node)) continue;
      const siblings = groups.get(node.parentId) ?? [];
      siblings.push(node);
      groups.set(node.parentId, siblings);
    }
    for (const siblings of groups.values()) siblings.sort(compareNodes);
    const scopes = new Map(
      [...analysis.blocks, ...analysis.categories].map((scope) => [
        scope.nodeId,
        scope,
      ]),
    );
    const visit = (parentId: string | null, depth: number): void => {
      for (const node of groups.get(parentId) ?? []) {
        const scope = scopes.get(node.nodeId);
        const amount: ExportValue =
          node.kind === 'ITEM'
            ? { status: node.amount!.state, value: node.amount!.value }
            : { status: scope!.status, value: scope!.value };
        rows.push({
          kind: node.kind,
          label: node.name,
          depth,
          amount,
          quantity:
            node.kind === 'ITEM' && node.quantityEnabled
              ? {
                  status: node.quantity?.state ?? 'SIN_CARGAR',
                  value: node.quantity?.value ?? null,
                }
              : null,
          unit: node.kind === 'ITEM' ? (node.unit ?? null) : null,
          note: node.kind === 'ITEM' ? (node.note ?? null) : null,
        });
        visit(node.nodeId, depth + 1);
      }
    };
    visit(null, 0);
  }
  const emptyBase: ExportValue = {
    status: 'BLOCKED',
    value: null,
    reason: 'UNINITIALIZED',
  };
  const baseLabels = ['Ingresos', 'Costos', 'Gastos Generales'] as const;
  const indicators: ExportIndicator[] = baseLabels.map((label, index) => ({
    label,
    unit: 'ARS',
    result: analysis.blocks[index]
      ? {
          status: analysis.blocks[index]!.status,
          value: analysis.blocks[index]!.value,
        }
      : emptyBase,
  }));
  const { metrics, projections } = analysis;
  indicators.push(
    { label: 'Margen Bruto $', unit: 'ARS', result: metrics.grossMargin },
    {
      label: 'Margen Bruto %',
      unit: 'PERCENT',
      result: metrics.grossMarginPercent,
    },
    { label: 'Resultado Neto $', unit: 'ARS', result: metrics.netResult },
    {
      label: 'Resultado Neto %',
      unit: 'PERCENT',
      result: metrics.netResultPercent,
    },
    {
      label: 'Punto de Equilibrio',
      unit: 'ARS',
      result: projections.breakEvenSales,
    },
    {
      label: 'Objetivo de Ventas',
      unit: 'ARS',
      result: projections.targetSales,
    },
    {
      label: 'Diferencia contra objetivo',
      unit: 'ARS',
      result: projections.targetDifference,
    },
    {
      label: 'Cumplimiento',
      unit: 'PERCENT',
      result: projections.targetCompliance,
    },
    {
      label: 'Semáforo',
      unit: 'TRAFFIC_LIGHT',
      result: projections.trafficLight,
    },
  );
  return {
    branchName: input.branchName,
    year: input.year,
    month: input.month,
    lifecycleStatus: input.lifecycleStatus,
    loadStatus: input.loadStatus,
    revision: input.revision,
    periodNote: input.periodNote,
    rows,
    indicators,
    analysis,
  };
}

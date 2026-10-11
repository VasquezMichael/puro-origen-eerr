import { isArchived, type EerrPeriod, type EerrStructure, type StructureNode } from '@puro-origen/domain';
import { compareMetricValues } from './comparison.js';
import type { MetricStatus } from './index.js';

export type ItemValueState = 'NO_EXISTIA' | 'SIN_CARGAR' | 'CARGADO';
export type QuantityValueState = ItemValueState | 'NO_APLICA';
export type ItemChangeReason = 'CURRENT_NO_EXISTIA' | 'REFERENCE_NO_EXISTIA' | 'CURRENT_SIN_CARGAR' |
    'REFERENCE_SIN_CARGAR' | 'CURRENT_NO_APLICA' | 'REFERENCE_NO_APLICA' |
    'UNIT_MISMATCH' | 'REFERENCE_ZERO' | 'INVALID_VALUE';
export type ItemChange = {
  status: MetricStatus;
  value: string | null;
  reason: ItemChangeReason | null;
};
export type ItemVariation = {
  absoluteChange: ItemChange;
  percentageChange: ItemChange;
};
export type ItemPeriodValue = {
  period: EerrPeriod;
  nodeId: string | null;
  archived: boolean;
  amount: { state: ItemValueState; value: string | null };
  quantity: { state: QuantityValueState; value: string | null; unit: string | null };
};
export type ComparedItem = {
  code: string;
  name: string;
  kind: 'ITEM';
  inReferenceStructure: boolean;
  parentCode: string;
  rootCode: string;
  path: string[];
  periods: [ItemPeriodValue, ItemPeriodValue];
  amountVariation: ItemVariation;
  quantityVariation: ItemVariation | null;
};
export type ItemComparison = {
  orientation: 'LATER_MINUS_EARLIER';
  periods: [EerrPeriod, EerrPeriod];
  items: ComparedItem[];
};

function periodNumber(period: EerrPeriod) { return period.year * 12 + period.month; }
function indexItems(structure: EerrStructure) {
  const byId = new Map(structure.nodes.map(node => [node.nodeId, node]));
  const items = new Map<string, { node: StructureNode; parentCode: string; rootCode: string; path: string[]; order: string }>();
  for (const node of structure.nodes) {
    if (node.kind !== 'ITEM') continue;
    const ancestors: StructureNode[] = [];
    let parent = node.parentId === null ? undefined : byId.get(node.parentId);
    while (parent) { ancestors.unshift(parent); parent = parent.parentId === null ? undefined : byId.get(parent.parentId); }
    const root = ancestors[0];
    if (!root) throw new Error('Ítem sin bloque');
    items.set(node.code, {
      node, parentCode: ancestors.at(-1)!.code, rootCode: root.code,
      path: ancestors.map(part => part.name),
      order: [...ancestors, node].map(part => String(part.position).padStart(5, '0')).join('.'),
    });
  }
  return items;
}
function value(period: EerrPeriod, node?: StructureNode): ItemPeriodValue {
  return {
    period, nodeId: node?.nodeId ?? null, archived: node ? isArchived(node) : false,
    amount: !node ? { state: 'NO_EXISTIA', value: null } :
      node.amount?.state === 'CARGADO' ? { state: 'CARGADO', value: node.amount.value } :
        { state: 'SIN_CARGAR', value: null },
    quantity: !node ? { state: 'NO_EXISTIA', value: null, unit: null } :
      !node.quantityEnabled ? { state: 'NO_APLICA', value: null, unit: null } :
        node.quantity?.state === 'CARGADO' ? { state: 'CARGADO', value: node.quantity.value, unit: node.unit ?? null } :
          { state: 'SIN_CARGAR', value: null, unit: node.unit ?? null },
  };
}
function variation(
  later: { state: QuantityValueState; value: string | null },
  earlier: { state: QuantityValueState; value: string | null },
  quantity: boolean,
  unitsMatch = true,
): ItemVariation {
  const change = (status: MetricStatus, value: string | null, reason: ItemChangeReason | null): ItemChange => ({ status, value, reason });
  const unavailable = (side: 'CURRENT' | 'REFERENCE', state: QuantityValueState): ItemVariation => {
    const reason = `${side}_${state}` as ItemChangeReason;
    return { absoluteChange: change('BLOCKED', null, reason), percentageChange: change('NOT_CALCULABLE', null, reason) };
  };
  if (later.state !== 'CARGADO') return unavailable('CURRENT', later.state);
  if (earlier.state !== 'CARGADO') return unavailable('REFERENCE', earlier.state);
  if (!unitsMatch) return {
    absoluteChange: change('NOT_CALCULABLE', null, 'UNIT_MISMATCH'),
    percentageChange: change('NOT_CALCULABLE', null, 'UNIT_MISMATCH'),
  };
  if (later.value === null || earlier.value === null ||
    !(quantity ? /^\d+$/.test(later.value) && /^\d+$/.test(earlier.value) : /^\d+\.\d{2}$/.test(later.value) && /^\d+\.\d{2}$/.test(earlier.value)))
    return {
      absoluteChange: change('NOT_CALCULABLE', null, 'INVALID_VALUE'),
      percentageChange: change('NOT_CALCULABLE', null, 'INVALID_VALUE'),
    };
  const result = compareMetricValues(quantity ? `${later.value}.00` : later.value, quantity ? `${earlier.value}.00` : earlier.value, 'ARS');
  return {
    absoluteChange: change('COMPLETE', quantity ? result.absoluteDifference?.slice(0, -3) ?? null : result.absoluteDifference, null),
    percentageChange: change(result.status, result.relativeVariation, result.reason === 'REFERENCE_NOT_POSITIVE' ? 'REFERENCE_ZERO' : null),
  };
}

/** Alinea snapshots por code; nodeId solo identifica el ítem dentro de cada snapshot. */
export function compareEerrItems(
  first: { period: EerrPeriod; structure: EerrStructure },
  second: { period: EerrPeriod; structure: EerrStructure },
): ItemComparison {
  const [earlier, later] = periodNumber(first.period) <= periodNumber(second.period) ? [first, second] : [second, first];
  const older = indexItems(earlier.structure), newer = indexItems(later.structure);
  const codes = new Set([...older.keys(), ...newer.keys()]);
  const items = [...codes].sort((a, b) => {
    const x = newer.get(a), y = newer.get(b);
    if (!!x !== !!y) return x ? -1 : 1;
    return (x?.order ?? older.get(a)!.order).localeCompare(y?.order ?? older.get(b)!.order) || a.localeCompare(b);
  }).map((code): ComparedItem => {
    const oldItem = older.get(code), newItem = newer.get(code), reference = newItem ?? oldItem!;
    const before = value(earlier.period, oldItem?.node), after = value(later.period, newItem?.node);
    const hasQuantity = !!oldItem?.node.quantityEnabled || !!newItem?.node.quantityEnabled;
    return {
      code, name: reference.node.name, kind: 'ITEM', inReferenceStructure: !!newItem,
      parentCode: reference.parentCode, rootCode: reference.rootCode, path: reference.path,
      periods: [before, after],
      amountVariation: variation(after.amount, before.amount, false),
      quantityVariation: hasQuantity ? variation(after.quantity, before.quantity, true, after.quantity.unit === before.quantity.unit) : null,
    };
  });
  return { orientation: 'LATER_MINUS_EARLIER', periods: [earlier.period, later.period], items };
}

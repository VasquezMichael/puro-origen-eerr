import type { ItemComparison, ItemVariation, ItemValueState, QuantityValueState } from '@puro-origen/calculation-engine';
import { periodLabel } from './dashboard-model';
import { formatComparisonValue } from './comparison-model';
import styles from './dashboard.module.css';

const integer = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function stateLabel(state: ItemValueState | QuantityValueState, value: string | null, quantity = false): string {
  if (state === 'NO_EXISTIA') return 'NO_EXISTIA';
  if (state === 'SIN_CARGAR') return 'SIN_CARGAR';
  if (state === 'NO_APLICA') return 'No aplica';
  return value === null ? 'Dato inválido' : quantity ? integer(value) : formatComparisonValue(value, 'ARS');
}
function change(variation: ItemVariation | null, quantity = false): string {
  if (!variation) return '—';
  const { absoluteChange, percentageChange } = variation;
  if (absoluteChange.reason === 'UNIT_MISMATCH') return 'Unidades incompatibles';
  const absolute = absoluteChange.status === 'COMPLETE' && absoluteChange.value !== null
    ? quantity ? integer(absoluteChange.value) : formatComparisonValue(absoluteChange.value, 'ARS') : '—';
  const percentage = percentageChange.status === 'COMPLETE' && percentageChange.value !== null
    ? formatComparisonValue(percentageChange.value, 'PERCENT') : '% no calculable';
  return `${absolute} · ${percentage}${percentageChange.reason === 'REFERENCE_ZERO' ? ' (referencia cero)' : ''}`;
}

export function ItemComparisonTable({ comparison }: { comparison: ItemComparison | null }) {
  if (comparison === null) return <p>La comparación de ítems requiere dos EERR con estructura válida y accesible.</p>;
  const [older, newer] = comparison.periods;
  return <section className={styles.subsection} aria-labelledby="item-comparison-title">
    <h3 id="item-comparison-title">Ítems e indicadores de cantidad</h3>
    <p>Orden cronológico: {periodLabel(older)} → {periodLabel(newer)}. Variación = reciente menos anterior. Los conceptos se identifican por código; los ausentes en la estructura reciente permanecen visibles.</p>
    <div className={styles.tableScroll} role="region" aria-label="Comparación de ítems con desplazamiento horizontal" tabIndex={0}>
      <table className={styles.comparisonTable}>
        <thead><tr><th scope="col">Concepto</th><th scope="col">Tipo</th><th scope="col">Importe · {periodLabel(older)}</th><th scope="col">Importe · {periodLabel(newer)}</th><th scope="col">Variación de importe</th><th scope="col">Cantidad · {periodLabel(older)}</th><th scope="col">Cantidad · {periodLabel(newer)}</th><th scope="col">Variación de cantidad</th></tr></thead>
        <tbody>{comparison.items.map(item => {
          const [before, after] = item.periods;
          const quantity = item.quantityVariation !== null;
          return <tr key={item.code}>
            <th scope="row">{item.name}<small>{item.path.join(' / ')}</small><small>Código: {item.code}</small>{!item.inReferenceStructure && <small>Solo en período histórico; fuera de la estructura reciente</small>}{(before.archived || after.archived) && <small>Archivado en {before.archived && after.archived ? 'ambos períodos' : before.archived ? periodLabel(older) : periodLabel(newer)}</small>}</th>
            <td>Ítem</td><td>{stateLabel(before.amount.state, before.amount.value)}</td><td>{stateLabel(after.amount.state, after.amount.value)}</td><td>{change(item.amountVariation)}</td>
            <td>{quantity ? `${stateLabel(before.quantity.state, before.quantity.value, true)}${before.quantity.unit ? ` ${before.quantity.unit}` : ''}` : '—'}</td>
            <td>{quantity ? `${stateLabel(after.quantity.state, after.quantity.value, true)}${after.quantity.unit ? ` ${after.quantity.unit}` : ''}` : '—'}</td>
            <td>{change(item.quantityVariation, true)}</td>
          </tr>;
        })}</tbody>
      </table>
      {comparison.items.length === 0 && <p>No hay ítems en los períodos seleccionados.</p>}
    </div>
  </section>;
}

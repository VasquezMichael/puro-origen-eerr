import { describe, expect, it } from 'vitest';
import {
  ROOTS,
  assertStructure,
  evaluateMoneyExpression,
} from '@puro-origen/domain';
import {
  DEMO_BRANCHES,
  DEMO_CATEGORIES,
  DEMO_CODE,
  DEMO_EXPECTED_CONSOLIDATED_NET,
  DEMO_EXPECTED_NET,
  DEMO_GOALS,
  DEMO_ITEMS,
  DEMO_PERIODS,
  DEMO_SLOTS,
} from './demo-dataset.manifest.js';
import {
  APPLY_PHRASE,
  CLEAN_PHRASE,
  buildDemoStructure,
  expectedDemoResults,
} from './demo-dataset.js';

const at = new Date('2026-10-09T12:00:00Z');
const actor = '111111111111111111111111';

describe('dataset demostrativo integral', () => {
  it('limita el alcance a tres sucursales y agosto/septiembre de 2026', () => {
    expect(DEMO_CODE).toBe('demo-acceptance-v1');
    expect(DEMO_BRANCHES).toEqual(['CALLE 13', 'CALLE 50', 'CALLE 59']);
    expect(DEMO_PERIODS).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
    expect(DEMO_SLOTS).toHaveLength(6);
  });
  it('mantiene códigos globales estables y nodeId independientes por EERR', () => {
    const structures = DEMO_SLOTS.map((_, index) =>
      buildDemoStructure(index, actor, at),
    );
    const codeLists = structures.map((structure) =>
      structure.nodes.map((node) => node.code),
    );
    expect(
      codeLists.every(
        (codes) => JSON.stringify(codes) === JSON.stringify(codeLists[0]),
      ),
    ).toBe(true);
    expect(
      new Set(
        structures.flatMap((structure) =>
          structure.nodes.map((node) => node.nodeId),
        ),
      ).size,
    ).toBe(6 * 28);
    expect(DEMO_CATEGORIES).toHaveLength(7);
    expect(DEMO_ITEMS).toHaveLength(18);
    expect(structures[0]!.nodes.slice(0, 3).map((node) => node.code)).toEqual(
      ROOTS.map((root) => root.code),
    );
  });
  it('crea seis snapshots completos sin archivos ni SIN_CARGAR', () => {
    for (const index of DEMO_SLOTS.keys()) {
      const structure = buildDemoStructure(index, actor, at);
      expect(() => assertStructure(structure.nodes)).not.toThrow();
      expect(structure.nodes).toHaveLength(28);
      expect(structure.nodes.some((node) => node.archive)).toBe(false);
      expect(
        structure.nodes
          .filter((node) => node.kind === 'ITEM')
          .every((node) => node.amount?.state === 'CARGADO'),
      ).toBe(true);
      expect(
        structure.nodes
          .filter((node) => node.kind === 'ITEM')
          .every((node) => /^\d+\.\d{2}$/.test(node.amount!.value!)),
      ).toBe(true);
    }
  });
  it('evalúa expresiones con la regla monetaria, conserva ceros, cantidades y notas', () => {
    const structure = buildDemoStructure(0, actor, at);
    const byCode = new Map(structure.nodes.map((node) => [node.code, node]));
    const pedidos = byCode.get(DEMO_ITEMS[1]!.code)!;
    expect(pedidos.amount).toMatchObject({
      input: '350000-123.45',
      value: '349876.55',
    });
    expect(evaluateMoneyExpression('20000+19000').value).toBe('39000.00');
    expect(byCode.get(DEMO_ITEMS.at(-1)!.code)!.amount).toMatchObject({
      input: '0*5',
      value: '0.00',
    });
    expect(pedidos.quantity).toEqual({ state: 'CARGADO', value: '1020' });
    expect(pedidos.unit).toBe('pedidos');
    expect(
      structure.nodes.filter((node) => node.kind === 'ITEM' && node.note),
    ).toHaveLength(3);
  });
  it('configura metas en ambas modalidades y una meta inalcanzable', () => {
    expect(DEMO_GOALS.map((goal) => goal.mode)).toEqual([
      'NET_MARGIN_PERCENT',
      'NET_MARGIN_PERCENT',
      'NET_PROFIT_AMOUNT',
      'NET_PROFIT_AMOUNT',
      'NET_MARGIN_PERCENT',
      'NET_MARGIN_PERCENT',
    ]);
    const results = expectedDemoResults();
    expect(results.perEerr[0]!.projections.targetSales.reason).toBe(
      'TARGET_MARGIN_UNATTAINABLE',
    );
    expect(results.perEerr[4]!.projections.targetSales.status).toBe('COMPLETE');
  });
  it('calcula resultados y comparaciones con el motor existente', () => {
    const result = expectedDemoResults();
    expect(
      result.consolidated.every((row) => row.result.status === 'COMPLETE'),
    ).toBe(true);
    expect(result.perEerr.map((row) => row.metrics.netResult.value)).toEqual(
      DEMO_EXPECTED_NET,
    );
    expect(
      result.consolidated.map((row) => row.result.netResult.value),
    ).toEqual(DEMO_EXPECTED_CONSOLIDATED_NET);
    expect(result.perEerr.map((row) => row.blocks[0]!.value)).toEqual([
      '1100031.75',
      '1270012.90',
      '1300045.85',
      '1340019.20',
      '1800015.70',
      '2100039.25',
    ]);
    expect(
      result.monthlyComparisons[0]!.result.netResult.absoluteDifference?.startsWith(
        '-',
      ),
    ).toBe(true);
    expect(result.monthlyComparisons[1]!.result.sales.absoluteDifference).toBe(
      '39973.35',
    );
    expect(
      result.monthlyComparisons[2]!.result.netResult.absoluteDifference?.startsWith(
        '-',
      ),
    ).toBe(false);
    expect(
      result.branchComparisons[1]!.results.map(
        (row) => row.result.netResult.absoluteDifference,
      ),
    ).toEqual(['-79081.85', '-461177.35']);
    expect(
      BigInt(result.consolidated[1]!.result.income.value!.replace('.', '')),
    ).toBeGreaterThan(
      BigInt(result.consolidated[0]!.result.income.value!.replace('.', '')),
    );
  });
  it('exige frases distintas para escritura y limpieza', () => {
    expect(APPLY_PHRASE).not.toBe(CLEAN_PHRASE);
  });
});

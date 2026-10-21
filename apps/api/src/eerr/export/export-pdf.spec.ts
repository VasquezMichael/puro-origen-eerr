import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { describe, expect, it, vi } from 'vitest';
import {
  emptyAmount,
  initialNodes,
  type EerrStructure,
} from '@puro-origen/domain';
import { EerrLoadStatus } from '../schemas/eerr.schema.js';
import { buildEerrExportViewModel } from './export-view-model.js';
import { displayValue, moneyLabel, percentLabel } from './export-display.js';
import { renderEerrPdf } from './export-pdf.js';
import { monetaryExcelNumber, ExportPrecisionError } from './export-xlsx.js';
import { exportFilename } from './export.service.js';

function fixture(itemCount = 2, longNotes = false) {
  const nodes = initialNodes([], randomUUID);
  const category = {
    nodeId: randomUUID(),
    code: randomUUID(),
    parentId: nodes[0]!.nodeId,
    position: 0,
    name: 'Categoría histórica Ñandú',
    kind: 'CATEGORY' as const,
  };
  nodes.push(category);
  for (let index = 0; index < itemCount; index++)
    nodes.push({
      nodeId: randomUUID(),
      code: randomUUID(),
      parentId: category.nodeId,
      position: index,
      name: `Ítem histórico ${index} — áéíóú ÁÉÍÓÚ ñ Ñ ü`,
      kind: 'ITEM',
      amount:
        index === 0
          ? { ...emptyAmount(), state: 'CARGADO', input: '0', value: '0.00' }
          : emptyAmount(),
      quantityEnabled: true,
      quantity:
        index === 0
          ? { state: 'CARGADO' as const, value: '0' }
          : { state: 'SIN_CARGAR' as const, value: null },
      unit: 'unidades',
      note:
        longNotes && index === 0
          ? `Nota larga áéíóú\n${'Línea áéíóú\n'.repeat(70)}`
          : 'Nota del ítem ñ',
    });
  const structure: EerrStructure = {
    schemaVersion: 1,
    structureVersion: 1,
    initializedAt: '2026-09-01T00:00:00Z',
    initializedBy: 'test',
    nodes,
  };
  return buildEerrExportViewModel({
    branchName: 'CALLE 13 — Ñandú',
    year: 2026,
    month: 9,
    lifecycleStatus: 'CLOSED',
    loadStatus: EerrLoadStatus.PARCIAL,
    revision: 7,
    periodNote: longNotes
      ? `Período con saltos\n${'Observación extensa áéíóú.\n'.repeat(25)}`
      : 'Nota del período',
    structure,
    salesGoal: null,
  });
}

function pageCount(buffer: Buffer): number {
  return [...buffer.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
}

async function renderedText(model: ReturnType<typeof fixture>) {
  const spy = vi.spyOn(PDFDocument.prototype, 'text');
  try {
    const buffer = await renderEerrPdf(model);
    const text = spy.mock.calls.map((call) => String(call[0])).join('\n');
    const placements = spy.mock.calls.map((call) => ({
      x: Number(call[1]),
      y: Number(call[2]),
      width: Number((call[3] as { width?: number } | undefined)?.width),
    }));
    return { buffer, text, placements };
  } finally {
    spy.mockRestore();
  }
}

describe('PDF individual desde EerrExportViewModel', () => {
  it('genera una página A4 apaisada legible sin IDs ni fórmulas', async () => {
    const model = fixture();
    const { buffer, text } = await renderedText(model);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString('latin1').trimEnd()).toMatch(/%%EOF$/);
    expect(pageCount(buffer)).toBe(1);
    expect(buffer.toString('latin1')).toContain(
      '/MediaBox [0 0 841.89 595.28]',
    );
    for (const label of [
      'Estado de Resultados',
      'CALLE 13',
      'Cerrado',
      'Parcial',
      'Revisión: 7',
      'Ingresos',
      'Margen Bruto',
      'Resultado Neto',
      'Punto de Equilibrio',
      'Objetivo de Ventas',
      'Diferencia',
      'Cumplimiento',
      'Semáforo',
      'Categoría histórica',
      'Ítem histórico',
      'Sin cargar',
      '$ 0,00',
      'Nota del período',
      'Página 1',
    ])
      expect(text).toContain(label);
    expect(text).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(text).not.toMatch(/\b[0-9a-f]{24}\b/i);
  });

  it('pagina filas, jerarquía profunda y notas extensas sin perder encabezados', async () => {
    const { buffer, text, placements } = await renderedText(fixture(110, true));
    const pages = pageCount(buffer);
    expect(pages).toBeGreaterThan(2);
    expect((text.match(/Página \d+/g) ?? []).length).toBe(pages);
    expect((text.match(/Importe \/ estado/g) ?? []).length).toBeGreaterThan(2);
    expect(text).toContain('Nota larga áéíóú');
    expect(text).toContain('Período con saltos');
    expect(text).toContain('Ítem histórico 109');
    expect(buffer.toString('latin1').trimEnd()).toMatch(/%%EOF$/);
    for (const placement of placements) {
      expect(placement.x).toBeGreaterThanOrEqual(36);
      expect(placement.x + placement.width).toBeLessThanOrEqual(806);
      expect(placement.y).toBeLessThanOrEqual(566);
      expect(placement.y).toBeGreaterThanOrEqual(36);
    }
  });

  it('conserva decimales que el XLSX editable debe rechazar', async () => {
    const model = fixture();
    model.rows[0]!.amount = { status: 'COMPLETE', value: '10000000000000.01' };
    expect(() => monetaryExcelNumber('10000000000000.01')).toThrow(
      ExportPrecisionError,
    );
    const { buffer, text } = await renderedText(model);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(text).toContain('$ 10.000.000.000.000,01');
  });

  it('formatea dinero, porcentajes y estados sin convertir ausencias a cero', () => {
    expect(moneyLabel('1234567.89')).toBe('$ 1.234.567,89');
    expect(moneyLabel('-1234567.89')).toBe('$ -1.234.567,89');
    expect(percentLabel('20.0000')).toBe('20,00 %');
    expect(percentLabel('-12.5000')).toBe('-12,50 %');
    expect(percentLabel('125.0000')).toBe('125,00 %');
    expect(displayValue({ status: 'PARTIAL', value: '20.00' }, 'ARS')).toBe(
      '$ 20,00 (Parcial)',
    );
    expect(displayValue({ status: 'SIN_CARGAR', value: null }, 'ARS')).toBe(
      'Sin cargar',
    );
    expect(displayValue({ status: 'CARGADO', value: '0.00' }, 'ARS')).toBe(
      '$ 0,00',
    );
    expect(
      displayValue(
        { status: 'NOT_CALCULABLE', value: null, reason: 'ZERO_REVENUE' },
        'PERCENT',
      ),
    ).toBe('No calculable — Ingresos cero');
  });

  it('Helvetica representa los caracteres españoles requeridos sin archivo de fuentes', () => {
    const document = new PDFDocument();
    document.font('Helvetica');
    const font = (
      document as unknown as { _font: { encode(text: string): [string[]] } }
    )._font;
    expect(font.encode('áéíóú ÁÉÍÓÚ ñ Ñ ü $ %')[0]).toEqual([
      'e1',
      'e9',
      'ed',
      'f3',
      'fa',
      '20',
      'c1',
      'c9',
      'cd',
      'd3',
      'da',
      '20',
      'f1',
      '20',
      'd1',
      '20',
      'fc',
      '20',
      '24',
      '20',
      '25',
    ]);
    document.end();
  });

  it('reutiliza filename seguro con una única extensión pdf', () => {
    const filename = exportFilename(
      '../\\\"\r\nÑandú'.repeat(30),
      2026,
      9,
      'pdf',
    );
    expect(filename).toMatch(/^EERR_[A-Z0-9-]+_2026-09\.pdf$/);
    expect(filename.length).toBeLessThanOrEqual(66);
    expect(filename.match(/\.pdf/g)).toHaveLength(1);
    expect(filename).not.toContain('..');
  });
});

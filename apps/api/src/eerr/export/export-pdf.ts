import PDFDocument from 'pdfkit';
import type { EerrExportViewModel, ExportRow } from './export-view-model.js';
import { displayValue, trafficLightLabel } from './export-display.js';

export const PDF_MIME = 'application/pdf';

const MARGIN = 36;
const BOTTOM = 548;
const LINE_HEIGHT = 10.5;
const CELL_PADDING = 4;
const COLUMNS = [225, 150, 80, 314] as const;
const DARK = '#285343';
const TEXT = '#182921';

type PdfRow = {
  cells: [string, string, string, string];
  depth: number;
  bold: boolean;
};

function wrappedLines(
  document: PDFKit.PDFDocument,
  text: string,
  width: number,
  fontSize = 8,
  bold = false,
): string[] {
  document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (document.widthOfString(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (line && document.widthOfString(line + character) > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function tableRow(row: ExportRow): PdfRow {
  const quantity = row.quantity
    ? `${displayValue(row.quantity, 'QUANTITY')}${row.unit && row.quantity.value !== null ? ` ${row.unit}` : ''}`
    : '—';
  return {
    cells: [
      row.label,
      displayValue(row.amount, 'ARS'),
      quantity,
      row.note ?? '',
    ],
    depth: row.depth,
    bold: row.kind !== 'ITEM',
  };
}

/** Renders an already calculated snapshot. No database reads or calculations occur here. */
export function renderEerrPdf(model: EerrExportViewModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      autoFirstPage: false,
      margin: 0,
      compress: false,
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    const contentWidth = 841.89 - MARGIN * 2;
    let pageNumber = 0;
    let y = MARGIN;

    const drawLine = (
      text: string,
      x: number,
      atY: number,
      width: number,
      size = 8,
      bold = false,
      color = TEXT,
    ) => {
      document
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(size)
        .fillColor(color)
        .text(text, x, atY, { width, lineBreak: false });
    };

    const drawTableHeader = () => {
      document.rect(MARGIN, y, contentWidth, 22).fill(DARK);
      let x = MARGIN + CELL_PADDING;
      for (const [index, title] of [
        'Concepto',
        'Importe / estado',
        'Cantidad',
        'Nota',
      ].entries()) {
        drawLine(
          title,
          x,
          y + 6,
          COLUMNS[index]! - CELL_PADDING * 2,
          8,
          true,
          '#FFFFFF',
        );
        x += COLUMNS[index]!;
      }
      y += 22;
    };

    const addPage = (table = true) => {
      document.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
      pageNumber++;
      y = MARGIN;
      drawLine(
        'Generado desde Gestión EERR',
        MARGIN,
        566,
        300,
        7,
        false,
        '#59665F',
      );
      drawLine(`Página ${pageNumber}`, 730, 566, 75, 7, false, '#59665F');
      if (table) drawTableHeader();
    };

    const drawRow = (row: PdfRow) => {
      const widths = [...COLUMNS];
      const indent = Math.min(row.depth * 11, 90);
      widths[0] -= indent;
      const lines = row.cells.map((cell, index) =>
        wrappedLines(
          document,
          cell,
          widths[index]! - CELL_PADDING * 2,
          8,
          row.bold,
        ),
      );
      const totalLines = Math.max(...lines.map((cell) => cell.length));
      const fullHeight = totalLines * LINE_HEIGHT + CELL_PADDING * 2;
      const freshCapacity = Math.floor(
        (BOTTOM - MARGIN - 22 - CELL_PADDING * 2) / LINE_HEIGHT,
      );
      if (fullHeight > BOTTOM - y && totalLines <= freshCapacity) addPage();

      let offset = 0;
      do {
        const capacity = Math.floor(
          (BOTTOM - y - CELL_PADDING * 2) / LINE_HEIGHT,
        );
        if (capacity < 1) {
          addPage();
          continue;
        }
        const count = Math.min(totalLines - offset, capacity);
        const height = count * LINE_HEIGHT + CELL_PADDING * 2;
        if (row.bold)
          document.rect(MARGIN, y, contentWidth, height).fill('#EAF0EB');
        document
          .moveTo(MARGIN, y + height)
          .lineTo(MARGIN + contentWidth, y + height)
          .strokeColor('#D5DDD7')
          .lineWidth(0.5)
          .stroke();
        let x = MARGIN;
        for (let index = 0; index < COLUMNS.length; index++) {
          for (const [lineIndex, line] of lines[index]!.slice(
            offset,
            offset + count,
          ).entries()) {
            drawLine(
              line,
              x + CELL_PADDING + (index === 0 ? indent : 0),
              y + CELL_PADDING + lineIndex * LINE_HEIGHT,
              widths[index]! - CELL_PADDING * 2,
              8,
              row.bold,
            );
          }
          x += COLUMNS[index]!;
        }
        y += height;
        offset += count;
        if (offset < totalLines) addPage();
      } while (offset < totalLines);
    };

    try {
      addPage(false);
      drawLine('Estado de Resultados', MARGIN, y, contentWidth, 18, true, DARK);
      y += 26;
      for (const line of wrappedLines(
        document,
        `Sucursal: ${model.branchName}`,
        contentWidth,
        9,
      )) {
        drawLine(line, MARGIN, y, contentWidth, 9);
        y += 12;
      }
      drawLine(
        `Período: ${String(model.month).padStart(2, '0')}/${model.year}    Estado del período: ${model.lifecycleStatus === 'CLOSED' ? 'Cerrado' : 'Abierto'}`,
        MARGIN,
        y,
        contentWidth,
        9,
      );
      y += 14;
      drawLine(
        `Estado de carga: ${{ SIN_CARGAR: 'Sin cargar', PARCIAL: 'Parcial', CARGADO: 'Cargado' }[model.loadStatus]}    Revisión: ${model.revision}`,
        MARGIN,
        y,
        contentWidth,
        9,
      );
      y += 21;
      drawLine('Resumen financiero', MARGIN, y, contentWidth, 11, true, DARK);
      y += 17;
      const summaryWidth = contentWidth / 2;
      for (let index = 0; index < 6; index++) {
        const pair = [model.indicators[index], model.indicators[index + 6]];
        const columns = pair.map((indicator) => {
          if (!indicator) return [''];
          const result =
            indicator.unit === 'TRAFFIC_LIGHT'
              ? trafficLightLabel(indicator.result)
              : displayValue(indicator.result, indicator.unit);
          return wrappedLines(
            document,
            `${indicator.label}: ${result}`,
            summaryWidth - 12,
            8,
          );
        });
        const count = Math.max(...columns.map((lines) => lines.length));
        for (const [column, lines] of columns.entries())
          for (const [lineIndex, line] of lines.entries())
            drawLine(
              line,
              MARGIN + column * summaryWidth,
              y + lineIndex * LINE_HEIGHT,
              summaryWidth - 12,
            );
        y += count * LINE_HEIGHT + 3;
      }
      y += 8;
      if (y + 22 > BOTTOM) addPage();
      else drawTableHeader();
      for (const row of model.rows) drawRow(tableRow(row));
      if (model.periodNote) {
        if (y + 35 > BOTTOM) addPage(false);
        y += 12;
        drawLine('Nota del período', MARGIN, y, contentWidth, 10, true, DARK);
        y += 16;
        const lines = wrappedLines(document, model.periodNote, contentWidth, 8);
        for (const line of lines) {
          if (y + LINE_HEIGHT > BOTTOM) addPage(false);
          drawLine(line, MARGIN, y, contentWidth);
          y += LINE_HEIGHT;
        }
      }
      document.end();
    } catch (error) {
      document.destroy(
        error instanceof Error ? error : new Error('Error al generar PDF'),
      );
      reject(error);
    }
  });
}

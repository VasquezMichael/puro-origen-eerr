import { IMPORT_LIMITS } from '@puro-origen/domain';
import { invalidFile, tooLarge, utf8 } from './file-safety.js';
export function csvEscape(value: string): string {
  return '"' + value.replaceAll('"', '""') + '"';
}
export function safeCsvLabel(value: string): string {
  return /^[=+\-@\t\r\n]/.test(value.trimStart()) || /^[\t\r\n]/.test(value)
    ? "'" + value
    : value;
}
export function readCsv(buffer: Buffer): string[][] {
  if (buffer.length > IMPORT_LIMITS.fileBytes) throw tooLarge();
  const text = utf8(buffer).replace(/^\uFEFF/, '');
  if (!text || text.includes('\0')) throw invalidFile();
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const field = () => {
    row.push(cell);
    cell = '';
    closed = false;
    if (row.length > 7) throw invalidFile();
  };
  const end = () => {
    field();
    rows.push(row);
    row = [];
    if (rows.length > IMPORT_LIMITS.rows + 1) throw tooLarge();
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === ';') field();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      end();
    } else if (char === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || char === '"') throw invalidFile();
      cell += char;
    }
    if (cell.length > IMPORT_LIMITS.cell) throw tooLarge();
  }
  if (quoted) throw invalidFile();
  if (cell || row.length || closed) end();
  return rows;
}

import {
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth.guard.js';
import { BranchesService } from '../../branches/branches.service.js';
import { EerrService } from '../eerr.service.js';
import { eerrLifecycle } from '../eerr-lifecycle.js';
import { publicSalesGoal } from '../schemas/sales-goal.schema.js';
import { publicStructure } from '../schemas/structure.schema.js';
import {
  buildEerrExportViewModel,
  type EerrExportViewModel,
} from './export-view-model.js';
import { ExportPrecisionError, renderEerrXlsx } from './export-xlsx.js';
import { renderEerrPdf } from './export-pdf.js';

type Viewer = NonNullable<AuthenticatedRequest['user']>;

export function exportFilename(
  branchName: string,
  year: number,
  month: number,
  extension: 'xlsx' | 'pdf' = 'xlsx',
): string {
  const slug =
    branchName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'SUCURSAL';
  return `EERR_${slug}_${year}-${String(month).padStart(2, '0')}.${extension}`;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly eerrs: EerrService,
    private readonly branches: BranchesService,
  ) {}

  private async snapshot(
    id: string,
    viewer: Viewer,
  ): Promise<EerrExportViewModel> {
    const row = await this.eerrs.readAuthorized(id, viewer);
    const branch = await this.branches.get(row.branchId.toString(), viewer);
    try {
      const revision = row.revision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0)
        throw new Error('Revisión inválida');
      return buildEerrExportViewModel({
        branchName: branch.name,
        year: row.year,
        month: row.month,
        lifecycleStatus: eerrLifecycle(row).lifecycleStatus,
        loadStatus: row.loadStatus,
        revision,
        periodNote: row.note ?? null,
        structure: publicStructure(row.structure),
        salesGoal: publicSalesGoal(row.salesGoal),
      });
    } catch {
      throw new InternalServerErrorException({
        statusCode: 500,
        code: 'INVALID_PERSISTED_DATA',
        message: 'No se pudo exportar el EERR con los datos guardados',
      });
    }
  }

  async xlsx(
    id: string,
    viewer: Viewer,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const model = await this.snapshot(id, viewer);
    try {
      return {
        buffer: await renderEerrXlsx(model),
        filename: exportFilename(model.branchName, model.year, model.month),
      };
    } catch (error) {
      if (error instanceof ExportPrecisionError)
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: 'EXPORT_PRECISION_LIMIT',
          message: error.message,
        });
      throw new InternalServerErrorException({
        statusCode: 500,
        code: 'INVALID_PERSISTED_DATA',
        message: 'No se pudo exportar el EERR con los datos guardados',
      });
    }
  }

  async pdf(
    id: string,
    viewer: Viewer,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const model = await this.snapshot(id, viewer);
    try {
      return {
        buffer: await renderEerrPdf(model),
        filename: exportFilename(
          model.branchName,
          model.year,
          model.month,
          'pdf',
        ),
      };
    } catch {
      throw new InternalServerErrorException({
        statusCode: 500,
        code: 'PDF_RENDER_FAILED',
        message: 'No se pudo generar el PDF del EERR',
      });
    }
  }
}

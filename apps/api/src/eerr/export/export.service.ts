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
import { buildEerrExportViewModel } from './export-view-model.js';
import { ExportPrecisionError, renderEerrXlsx } from './export-xlsx.js';

type Viewer = NonNullable<AuthenticatedRequest['user']>;

export function exportFilename(
  branchName: string,
  year: number,
  month: number,
): string {
  const slug =
    branchName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'SUCURSAL';
  return `EERR_${slug}_${year}-${String(month).padStart(2, '0')}.xlsx`;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly eerrs: EerrService,
    private readonly branches: BranchesService,
  ) {}

  async xlsx(
    id: string,
    viewer: Viewer,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const row = await this.eerrs.readAuthorized(id, viewer);
    const branch = await this.branches.get(row.branchId.toString(), viewer);
    try {
      const revision = row.revision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0)
        throw new Error('Revisión inválida');
      const model = buildEerrExportViewModel({
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
      return {
        buffer: await renderEerrXlsx(model),
        filename: exportFilename(branch.name, row.year, row.month),
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
}

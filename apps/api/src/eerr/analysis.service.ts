import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { calculateEerr } from '@puro-origen/calculation-engine';
import type { AnalysisResponse } from '@puro-origen/shared-types';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { EerrService } from './eerr.service.js';
import { publicStructure } from './schemas/structure.schema.js';
import { publicSalesGoal } from './schemas/sales-goal.schema.js';

type Viewer = NonNullable<AuthenticatedRequest['user']>;

@Injectable()
export class AnalysisService {
  constructor(private readonly eerrs: EerrService) {}

  async get(id: string, viewer: Viewer): Promise<AnalysisResponse> {
    const row = await this.eerrs.readAuthorized(id, viewer);
    try {
      const revision = row.revision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0)
        throw new Error('Revisión persistida inválida');
      const salesGoal = publicSalesGoal(row.salesGoal);
      return {
        eerrId: row._id,
        sourceRevision: revision,
        ...calculateEerr(publicStructure(row.structure), salesGoal),
        salesGoal,
      };
    } catch {
      throw new InternalServerErrorException({
        statusCode: 500,
        code: 'INVALID_PERSISTED_DATA',
        message: 'No se pudo calcular el EERR con los datos guardados',
      });
    }
  }
}

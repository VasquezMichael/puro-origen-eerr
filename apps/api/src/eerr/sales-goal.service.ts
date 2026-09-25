import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { normalizeSalesGoal, type SalesGoalValue } from '@puro-origen/domain';
import type { SalesGoalResponse } from '@puro-origen/shared-types';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { BranchRole } from '../users/user-role.js';
import { EerrService } from './eerr.service.js';
import { EerrClock } from './eerr-clock.js';
import { revisionFilter } from './structure.repository.js';
import { Eerr, type EerrDocument } from './schemas/eerr.schema.js';
import { publicSalesGoal } from './schemas/sales-goal.schema.js';

type Viewer = NonNullable<AuthenticatedRequest['user']>;
const conflict = () =>
  new ConflictException('La revisión cambió; recargá el EERR');

@Injectable()
export class SalesGoalService {
  constructor(
    @InjectModel(Eerr.name) private readonly model: Model<EerrDocument>,
    private readonly eerrs: EerrService,
    private readonly clock: EerrClock,
  ) {}

  async put(
    id: string,
    input: unknown,
    viewer: Viewer,
  ): Promise<SalesGoalResponse> {
    const row = await this.eerrs.readAuthorized(id, viewer);
    if (
      !viewer.isAdmin &&
      !viewer.branchAccesses.some(
        (access) =>
          access.branchId.toLowerCase() ===
            row.branchId.toString().toLowerCase() &&
          access.role === BranchRole.EDITOR,
      )
    )
      throw new ForbiddenException(
        'Se requiere permiso de Editor en esta sucursal',
      );
    if (typeof input !== 'object' || input === null || Array.isArray(input))
      throw new BadRequestException('Solicitud de meta inválida');
    const body = input as Record<string, unknown>;
    if (
      Object.keys(body).sort().join(',') !== 'expectedRevision,goal' ||
      !Number.isSafeInteger(body.expectedRevision) ||
      (body.expectedRevision as number) < 0
    )
      throw new BadRequestException(
        'Se requieren expectedRevision y goal sin campos adicionales',
      );
    let goal: SalesGoalValue | null;
    try {
      goal = body.goal === null ? null : normalizeSalesGoal(body.goal);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Meta inválida',
      );
    }
    const revision = row.revision ?? 0;
    if (revision !== body.expectedRevision) throw conflict();
    if (row.structure == null)
      throw new BadRequestException('Primero prepará la estructura');
    const current = publicSalesGoal(row.salesGoal);
    if (
      (goal === null && current === null) ||
      (goal !== null &&
        current?.mode === goal.mode &&
        current.value === goal.value)
    )
      return { eerrId: row._id, revision, salesGoal: current };
    const now = this.clock.now();
    const update =
      goal === null
        ? {
            $unset: { salesGoal: 1 },
            $set: { updatedAt: now },
            $inc: { revision: 1 },
          }
        : {
            $set: {
              salesGoal: {
                mode: goal.mode,
                value: Types.Decimal128.fromString(goal.value),
                updatedAt: now,
                updatedBy: viewer.sub,
              },
              updatedAt: now,
            },
            $inc: { revision: 1 },
          };
    const saved = await this.model
      .findOneAndUpdate(
        { _id: row._id, ...revisionFilter(revision), structure: { $ne: null } },
        update,
        { returnDocument: 'after', runValidators: true, timestamps: false },
      )
      .exec();
    if (!saved) throw conflict();
    return {
      eerrId: saved._id,
      revision: saved.revision,
      salesGoal: publicSalesGoal(saved.salesGoal),
    };
  }
}

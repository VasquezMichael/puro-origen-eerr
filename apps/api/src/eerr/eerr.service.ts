import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { BranchesService } from '../branches/branches.service.js';
import { requireMongoId } from '../branches/mongo-id.pipe.js';
import { BranchRole } from '../users/user-role.js';
import { Eerr, EerrDocument } from './schemas/eerr.schema.js';
import type { CreateEerrDto, EerrMonthDto } from './dto/eerr.dto.js';

type Viewer = NonNullable<AuthenticatedRequest['user']>;

@Injectable()
export class EerrService {
  constructor(
    @InjectModel(Eerr.name) private readonly eerr: Model<EerrDocument>,
    private readonly branches: BranchesService,
  ) {}

  private assertAccess(branchId: string, viewer: Viewer, create = false) {
    const access = viewer.branchAccesses.find(
      (item) => item.branchId.toLowerCase() === branchId,
    );
    if (
      !viewer.isAdmin &&
      (!access || (create && access.role !== BranchRole.EDITOR))
    ) {
      throw new ForbiddenException('No tenés permiso para esta operación');
    }
  }

  async create(input: CreateEerrDto, viewer: Viewer) {
    const branchId = requireMongoId(input.branchId);
    this.assertAccess(branchId, viewer, true);
    const branch = await this.branches.get(branchId, viewer);
    if (!branch.active)
      throw new BadRequestException(
        'No se puede crear un EERR en una sucursal inactiva',
      );
    const now = new Date();
    const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const start =
      branch.startDate.getUTCFullYear() * 12 + branch.startDate.getUTCMonth();
    const period = input.year * 12 + input.month - 1;
    if (period > current)
      throw new BadRequestException('No se pueden crear períodos futuros');
    if (period < start)
      throw new BadRequestException(
        'El período es anterior al mes de inicio de la sucursal',
      );
    const key = { branchId, year: input.year, month: input.month };
    if (await this.eerr.exists(key)) throw this.duplicate();
    try {
      const row = await this.eerr.create({ ...key, createdBy: viewer.sub });
      return this.toPublic(row);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw this.duplicate();
      }
      throw error;
    }
  }

  async list(branchId: string | undefined, viewer: Viewer) {
    const branches =
      branchId === undefined
        ? await this.branches.list(viewer)
        : [await this.accessibleBranch(branchId, viewer)];
    const rows = await this.eerr
      .find({ branchId: { $in: branches.map((branch) => branch.id) } })
      .sort({ year: -1, month: -1, _id: 1 })
      .exec();
    return rows.map((row) => this.toPublic(row));
  }

  async byMonth(input: EerrMonthDto, viewer: Viewer) {
    const branches = await this.branches.list(viewer);
    const rows = await this.eerr
      .find({
        ...input,
        branchId: { $in: branches.map((branch) => branch.id) },
      })
      .exec();
    const byBranch = new Map(
      rows.map((row) => [row.branchId.toString(), this.toPublic(row)]),
    );
    return branches.map((branch) => {
      const eerr = byBranch.get(branch.id);
      return eerr
        ? { branch, exists: true as const, eerr }
        : { branch, exists: false as const, eerr: null };
    });
  }

  async get(id: string, viewer: Viewer) {
    // El filtro hace indistinguibles un UUID inexistente y uno no autorizado.
    const branches = await this.branches.list(viewer);
    const row = await this.eerr
      .findOne({
        _id: id.toLowerCase(),
        branchId: { $in: branches.map((branch) => branch.id) },
      })
      .exec();
    if (!row) throw new NotFoundException('EERR no encontrado');
    return this.toPublic(row);
  }

  private async accessibleBranch(id: string, viewer: Viewer) {
    const branchId = requireMongoId(id);
    this.assertAccess(branchId, viewer);
    return this.branches.get(branchId, viewer);
  }

  private duplicate() {
    return new ConflictException(
      'Ya existe un EERR para esa sucursal, año y mes',
    );
  }

  private toPublic(row: EerrDocument) {
    return {
      id: row._id,
      branchId: row.branchId.toString(),
      year: row.year,
      month: row.month,
      loadStatus: row.loadStatus,
      createdBy: row.createdBy.toString(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

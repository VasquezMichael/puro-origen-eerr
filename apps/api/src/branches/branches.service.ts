import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Branch, BranchDocument } from './schemas/branch.schema.js';
import { cleanBranchName, normalizeBranchName } from './branch-name.js';
import { requireMongoId } from './mongo-id.pipe.js';
import type { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto.js';

export type BranchViewer = {
  isAdmin: boolean;
  branchAccesses: { branchId: string }[];
};

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel(Branch.name) private readonly branches: Model<BranchDocument>,
  ) {}

  async list(viewer: BranchViewer) {
    const ids = viewer.branchAccesses
      .map((access) => access.branchId)
      .filter((id) => /^[a-f\d]{24}$/i.test(id));
    const rows = await this.branches
      .find(viewer.isAdmin ? {} : { _id: { $in: ids } })
      .sort({ name: 1, _id: 1 })
      .exec();
    return rows.map((branch) => this.toPublicBranch(branch));
  }

  async get(id: string, viewer: BranchViewer) {
    const branch = await this.find(id);
    if (
      !viewer.isAdmin &&
      !viewer.branchAccesses.some(
        (access) => access.branchId.toLowerCase() === id.toLowerCase(),
      )
    ) {
      throw new ForbiddenException('No tenés acceso a esta sucursal');
    }
    return this.toPublicBranch(branch);
  }

  async create(input: CreateBranchDto) {
    const name = cleanBranchName(input.name);
    if (!name)
      throw new BadRequestException('El nombre de la sucursal es obligatorio');
    const now = new Date();
    try {
      const branch = await this.branches.create({
        name,
        normalizedName: normalizeBranchName(name),
        createdAt: now,
        startDate:
          input.startDate === undefined ? now : new Date(input.startDate),
        active: true,
      });
      return this.toPublicBranch(branch);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async update(id: string, input: UpdateBranchDto) {
    requireMongoId(id);
    const changes: {
      name?: string;
      normalizedName?: string;
      startDate?: Date;
    } = {};
    if (input.name !== undefined) {
      changes.name = cleanBranchName(input.name);
      if (!changes.name)
        throw new BadRequestException(
          'El nombre de la sucursal es obligatorio',
        );
      changes.normalizedName = normalizeBranchName(changes.name);
    }
    if (input.startDate !== undefined)
      changes.startDate = new Date(input.startDate);
    try {
      const branch = await this.branches
        .findByIdAndUpdate(
          id,
          { $set: changes },
          { new: true, runValidators: true },
        )
        .exec();
      if (!branch) throw new NotFoundException('Sucursal no encontrada');
      return this.toPublicBranch(branch);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async setStatus(id: string, active: boolean) {
    const branch = await this.find(id);
    if (branch.active === active) return this.toPublicBranch(branch);
    const updated = await this.branches
      .findByIdAndUpdate(
        id,
        { $set: { active } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Sucursal no encontrada');
    return this.toPublicBranch(updated);
  }

  async validateAccesses(accesses: { branchId: string }[]) {
    const ids = accesses.map((access) => requireMongoId(access.branchId));
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException(
        'No se puede asignar una sucursal más de una vez',
      );
    if (
      ids.length &&
      (await this.branches.countDocuments({ _id: { $in: ids } }).exec()) !==
        ids.length
    ) {
      throw new BadRequestException(
        'Una o más sucursales asignadas no existen',
      );
    }
    return ids;
  }

  private async find(id: string) {
    requireMongoId(id);
    const branch = await this.branches.findById(id).exec();
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }

  private rethrowWriteError(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      const key = 'keyPattern' in error ? error.keyPattern : undefined;
      if (typeof key === 'object' && key !== null && 'code' in key) {
        throw new ConflictException(
          'No se pudo generar un código único. Intentá nuevamente',
        );
      }
      throw new ConflictException('Ya existe una sucursal con ese nombre');
    }
    throw error;
  }

  private toPublicBranch(branch: BranchDocument) {
    return {
      id: branch.id as string,
      code: branch.code,
      name: branch.name,
      startDate: branch.startDate,
      active: branch.active,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }
}

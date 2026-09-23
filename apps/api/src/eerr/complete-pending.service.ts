import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { completePendingPlan, loadProgress } from '@puro-origen/domain';
import type {
  CompletePendingPreviewResponse,
  CompletePendingConfirmResponse,
} from '@puro-origen/shared-types';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { BranchRole } from '../users/user-role.js';
import { BranchesService } from '../branches/branches.service.js';
import { EerrService } from './eerr.service.js';
import { EerrClock } from './eerr-clock.js';
import { StructureRepository } from './structure.repository.js';
import { publicStructure } from './schemas/structure.schema.js';
import {
  ImportToken,
  IMPORT_PREVIEW_MS,
  type CompletePendingTicket,
} from './import/import-token.js';
type Viewer = NonNullable<AuthenticatedRequest['user']>;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conflict = () =>
  new ConflictException(
    'El EERR o la vista previa cambió. Generá un preview actualizado; no se completaron importes.',
  );
@Injectable()
export class CompletePendingService {
  constructor(
    private readonly store: StructureRepository,
    private readonly eerrs: EerrService,
    private readonly branches: BranchesService,
    private readonly clock: EerrClock,
    private readonly tokens: ImportToken,
  ) {}
  private async current(id: string, viewer: Viewer, session?: ClientSession) {
    const accessible = await this.eerrs.get(id, viewer);
    if (
      !viewer.isAdmin &&
      !viewer.branchAccesses.some(
        (a) =>
          a.branchId.toLowerCase() === accessible.branchId &&
          a.role === BranchRole.EDITOR,
      )
    )
      throw new ForbiddenException(
        'Se requiere permiso de Editor para completar importes',
      );
    const row = await this.store.get(accessible.id, session);
    if (!row) throw new NotFoundException('EERR no encontrado');
    try {
      const structure = publicStructure(row.structure);
      if (!structure)
        throw new BadRequestException('Primero prepará la estructura del EERR');
      const plan = completePendingPlan(structure);
      return { row, structure, plan, fingerprint: hash(structure) };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        'La estructura persistida es incompatible; requiere revisión.',
      );
    }
  }
  async preview(
    id: string,
    viewer: Viewer,
  ): Promise<CompletePendingPreviewResponse> {
    const current = await this.current(id, viewer);
    const branch = (await this.branches.list(viewer)).find(
      (b) => b.id === current.row.branchId.toString(),
    );
    if (!branch) throw new NotFoundException('EERR no encontrado');
    const expires = this.clock.now().getTime() + IMPORT_PREVIEW_MS;
    const { changes, ...summary } = current.plan;
    return {
      ...summary,
      destination: {
        id: current.row._id,
        branchId: branch.id,
        branchName: branch.name,
        year: current.row.year,
        month: current.row.month,
      },
      revision: current.row.revision ?? 0,
      expiresAt: new Date(expires).toISOString(),
      previewToken: changes.length
        ? this.tokens.sign({
            kind: 'complete-pending',
            id: current.row._id,
            actor: viewer.sub,
            revision: current.row.revision ?? 0,
            fingerprint: current.fingerprint,
            planDigest: hash(changes),
            expires,
          })
        : null,
    };
  }
  async confirm(
    id: string,
    token: string,
    viewer: Viewer,
  ): Promise<CompletePendingConfirmResponse> {
    // Permission is checked even for rejected or stale confirmations.
    await this.current(id, viewer);
    const ticket = this.tokens.verify<CompletePendingTicket>(
      token,
      'complete-pending',
    );
    if (ticket.id !== id.toLowerCase() || ticket.actor !== viewer.sub)
      throw conflict();
    return this.store.transaction(async (session) => {
      this.tokens.verify<CompletePendingTicket>(token, 'complete-pending');
      const current = await this.current(id, viewer, session);
      if (
        (current.row.revision ?? 0) !== ticket.revision ||
        current.fingerprint !== ticket.fingerprint ||
        !current.plan.changes.length ||
        hash(current.plan.changes) !== ticket.planDigest
      )
        throw conflict();
      // Reuse the indexed Decimal128 writer; this plan contains amounts only.
      const updated = await this.store.writeImport(
        current.row._id,
        ticket.revision,
        current.structure,
        current.plan.changes,
        this.clock.now(),
        session,
      );
      const structure = publicStructure(updated.structure);
      return {
        result: {
          id: updated._id,
          revision: updated.revision ?? 0,
          note: updated.note ?? null,
          structure,
          progress: loadProgress(structure!.nodes),
        },
        affectedItems: current.plan.changes.length,
      };
    });
  }
}

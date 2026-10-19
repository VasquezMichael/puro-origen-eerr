import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadProgress } from '@puro-origen/domain';
import type {
  EerrAuditEventType,
  EerrLifecycleStatus,
} from '@puro-origen/shared-types';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { BranchRole } from '../users/user-role.js';
import { EerrAuditRepository } from './eerr-audit.repository.js';
import { EerrClock } from './eerr-clock.js';
import { eerrLifecycle } from './eerr-lifecycle.js';
import { EerrService } from './eerr.service.js';
import { StructureRepository } from './structure.repository.js';
import { publicStructure } from './schemas/structure.schema.js';

type Viewer = NonNullable<AuthenticatedRequest['user']>;
type Operation = 'close' | 'reopen' | 'delete';

@Injectable()
export class EerrLifecycleService {
  constructor(
    private readonly eerrs: EerrService,
    private readonly structure: StructureRepository,
    private readonly audit: EerrAuditRepository,
    private readonly clock: EerrClock,
    private readonly config: ConfigService,
  ) {}

  capabilities() {
    return { softDeleteEnabled: this.config.get<string>('EERR_SOFT_DELETE_ENABLED') === 'true' };
  }

  close(id: string, expectedRevision: number, viewer: Viewer) {
    return this.change('close', id, expectedRevision, viewer);
  }

  reopen(id: string, expectedRevision: number, viewer: Viewer) {
    return this.change('reopen', id, expectedRevision, viewer);
  }

  async delete(id: string, expectedRevision: number, viewer: Viewer) {
    if (!this.capabilities().softDeleteEnabled)
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'EERR_SOFT_DELETE_DISABLED',
        message: 'La eliminación de EERR no está habilitada',
      });
    return this.change('delete', id, expectedRevision, viewer);
  }

  private async change(
    operation: Operation,
    id: string,
    expectedRevision: number,
    viewer: Viewer,
  ) {
    const eerrId = id.toLowerCase();
    const authorized = await this.eerrs.readAuthorized(eerrId, viewer);
    const branchId = authorized.branchId.toString();
    if (
      !viewer.isAdmin &&
      !viewer.branchAccesses.some(
        (access) =>
          access.branchId.toLowerCase() === branchId.toLowerCase() &&
          access.role === BranchRole.EDITOR,
      )
    )
      throw new ForbiddenException('Se requiere permiso de Editor en esta sucursal');

    return this.structure.transaction(async (session) => {
      const row = await this.structure.get(eerrId, session);
      if (!row) throw new NotFoundException('EERR no encontrado');
      const revision = row.revision ?? 0;
      if (revision !== expectedRevision)
        throw new ConflictException('La revisión cambió; recargá el EERR');
      const lifecycle = eerrLifecycle(row);
      const from: EerrLifecycleStatus = operation === 'reopen' ? 'CLOSED' : 'OPEN';
      if (lifecycle.lifecycleStatus !== from)
        throw new ConflictException('Estado de ciclo de vida incompatible');
      if (operation === 'delete' && lifecycle.everClosed)
        throw new ConflictException(
          'Un EERR que estuvo cerrado no se puede eliminar',
        );

      const pendingAmountCount =
        operation === 'close'
          ? loadProgress(publicStructure(row.structure)?.nodes ?? []).pending
          : undefined;
      const now = this.clock.now();
      const to =
        operation === 'close'
          ? 'CLOSED'
          : operation === 'reopen'
            ? 'OPEN'
            : 'DELETED';
      const saved = await this.structure.transition(
        eerrId, revision, from, to, viewer.sub, now, session,
      );
      if (!saved)
        throw new ConflictException('El EERR cambió; recargá antes de continuar');
      const eventType: EerrAuditEventType =
        operation === 'close'
          ? 'EERR_CLOSED'
          : operation === 'reopen'
            ? 'EERR_REOPENED'
            : 'EERR_DELETED';
      await this.audit.append(
        {
          eventType,
          eerrId,
          branchId,
          actorUserId: viewer.sub,
          occurredAt: now,
          revision: revision + 1,
          metadata: {
            previousLifecycleStatus: from,
            newLifecycleStatus: to === 'DELETED' ? from : to,
            previousRevision: revision,
            newRevision: revision + 1,
          },
        },
        session,
      );
      return {
        id: saved._id,
        branchId: saved.branchId.toString(),
        year: saved.year,
        month: saved.month,
        loadStatus: saved.loadStatus,
        ...eerrLifecycle(saved),
        createdBy: saved.createdBy.toString(),
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        revision: saved.revision,
        pendingAmountCount,
      };
    });
  }
}

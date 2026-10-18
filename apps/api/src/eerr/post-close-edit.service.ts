import { Injectable, NotFoundException } from '@nestjs/common';
import type { EerrAuditChangedArea } from '@puro-origen/shared-types';
import type { ClientSession } from 'mongoose';
import { EerrAuditRepository } from './eerr-audit.repository.js';
import { EerrClock } from './eerr-clock.js';
import { eerrLifecycle } from './eerr-lifecycle.js';
import { StructureRepository } from './structure.repository.js';

type Row = NonNullable<Awaited<ReturnType<StructureRepository['get']>>>;
type EditResult<T> = {
  response: T;
  updated?: { revision?: number };
  changedCount?: number;
};

@Injectable()
export class PostCloseEditService {
  constructor(
    private readonly store: StructureRepository,
    private readonly events: EerrAuditRepository,
    private readonly clock: EerrClock,
  ) {}

  async appendIfClosed(
    before: Row,
    updated: { revision?: number },
    actorUserId: string,
    changedArea: EerrAuditChangedArea,
    session: ClientSession,
    changedCount?: number,
  ) {
    const previousRevision = before.revision ?? 0;
    const newRevision = updated.revision ?? 0;
    if (newRevision !== previousRevision + 1)
      throw new Error('La edición no produjo exactamente una revisión nueva');
    if (eerrLifecycle(before).lifecycleStatus !== 'CLOSED') return;
    await this.events.append(
      {
        eventType: 'POST_CLOSE_EDIT',
        eerrId: before._id,
        branchId: before.branchId.toString(),
        actorUserId,
        occurredAt: this.clock.now(),
        revision: newRevision,
        metadata: {
          changedArea,
          previousRevision,
          newRevision,
          ...(changedCount === undefined ? {} : { changedCount }),
        },
      },
      session,
    );
  }

  async run<T>(
    id: string,
    actorUserId: string,
    changedArea: EerrAuditChangedArea,
    edit: (before: Row, session: ClientSession) => Promise<EditResult<T>>,
  ): Promise<T> {
    return this.store.transaction(async (session) => {
      const before = await this.store.get(id, session);
      if (!before) throw new NotFoundException('EERR no encontrado');
      const result = await edit(before, session);
      if (result.updated)
        await this.appendIfClosed(
          before,
          result.updated,
          actorUserId,
          changedArea,
          session,
          result.changedCount,
        );
      return result.response;
    });
  }
}

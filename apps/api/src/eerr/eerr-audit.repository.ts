import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import type {
  EerrAuditEvent,
  EerrAuditMetadata,
} from '@puro-origen/shared-types';
import {
  EerrAuditEventRecord,
  type EerrAuditEventDocument,
} from './schemas/eerr-audit-event.schema.js';

type AppendEvent = Omit<
  EerrAuditEvent,
  'branchId' | 'actorUserId' | 'occurredAt' | 'metadata'
> & {
  branchId: string;
  actorUserId: string;
  occurredAt: Date;
  metadata?: EerrAuditMetadata;
};

/** Solo inserción; el llamador debe compartir esta sesión con el CAS del EERR. */
@Injectable()
export class EerrAuditRepository {
  constructor(
    @InjectModel(EerrAuditEventRecord.name)
    private readonly events: Model<EerrAuditEventDocument>,
  ) {}

  async append(event: AppendEvent, session: ClientSession): Promise<void> {
    await this.events.create(
      [
        {
          ...event,
          branchId: new Types.ObjectId(event.branchId),
          actorUserId: new Types.ObjectId(event.actorUserId),
        },
      ],
      { session },
    );
  }
}

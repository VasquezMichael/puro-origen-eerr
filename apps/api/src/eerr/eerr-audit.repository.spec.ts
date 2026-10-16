import { Types, type ClientSession, type Model } from 'mongoose';
import { EerrAuditRepository } from './eerr-audit.repository.js';
import type { EerrAuditEventDocument } from './schemas/eerr-audit-event.schema.js';

it('inserta el evento en la misma sesión que usará el CAS del EERR', async () => {
  const create = vi.fn().mockResolvedValue([]);
  const repository = new EerrAuditRepository({
    create,
  } as unknown as Model<EerrAuditEventDocument>);
  const session = {} as ClientSession;
  const branchId = new Types.ObjectId().toString();
  const actorUserId = new Types.ObjectId().toString();
  const occurredAt = new Date('2026-10-15T12:00:00Z');
  await repository.append(
    {
      eventType: 'EERR_CLOSED',
      eerrId: 'eerr-uuid',
      branchId,
      actorUserId,
      occurredAt,
      revision: 4,
      metadata: {
        previousLifecycleStatus: 'OPEN',
        newLifecycleStatus: 'CLOSED',
      },
    },
    session,
  );
  expect(create).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        eventType: 'EERR_CLOSED',
        eerrId: 'eerr-uuid',
        occurredAt,
        revision: 4,
        branchId: new Types.ObjectId(branchId),
        actorUserId: new Types.ObjectId(actorUserId),
      }),
    ],
    { session },
  );
});

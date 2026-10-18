import 'reflect-metadata';
import { Mongoose, Types } from 'mongoose';
import {
  EerrAuditEventSchema,
  EERR_AUDIT_EVENT_TYPES,
  EERR_AUDIT_CHANGED_AREAS,
} from './eerr-audit-event.schema.js';

describe('esquema append-only de auditoría EERR', () => {
  it('acepta los cuatro tipos previstos y metadata estructurada', async () => {
    const Model = new Mongoose().model('OfflineAudit', EerrAuditEventSchema);
    const input = {
      eventType: 'EERR_CLOSED',
      eerrId: 'eerr-uuid',
      branchId: new Types.ObjectId(),
      actorUserId: new Types.ObjectId(),
      occurredAt: new Date('2026-10-15T12:00:00Z'),
      revision: 3,
      metadata: {
        previousLifecycleStatus: 'OPEN',
        newLifecycleStatus: 'CLOSED',
        previousRevision: 2,
        newRevision: 3,
      },
    };
    expect(EERR_AUDIT_EVENT_TYPES).toEqual([
      'EERR_CLOSED',
      'EERR_REOPENED',
      'EERR_DELETED',
      'POST_CLOSE_EDIT',
    ]);
    expect(EerrAuditEventSchema.options.collection).toBe('eerr_audit_events');
    expect(EerrAuditEventSchema.path('branchId').instance).toBe('ObjectId');
    expect(EerrAuditEventSchema.path('actorUserId').instance).toBe('ObjectId');
    expect(EerrAuditEventSchema.path('metadata').instance).toBe('Embedded');
    const row = new Model({
      ...input,
      metadata: { ...input.metadata, secret: 'not stored' },
    });
    await expect(row.validate()).resolves.toBeUndefined();
    expect(row.toObject().metadata).not.toHaveProperty('secret');
    await expect(
      new Model({ ...input, eventType: 'UNKNOWN' }).validate(),
    ).rejects.toThrow();
    await expect(
      new Model({ ...input, revision: -1 }).validate(),
    ).rejects.toThrow();
    expect(EERR_AUDIT_CHANGED_AREAS).toContain('GLOBAL_STRUCTURE');
    const edit = new Model({
      ...input,
      eventType: 'POST_CLOSE_EDIT',
      metadata: {
        changedArea: 'VALUE',
        previousRevision: 2,
        newRevision: 3,
        changedCount: 1,
        note: 'never stored',
      },
    });
    await expect(edit.validate()).resolves.toBeUndefined();
    expect(edit.toObject().metadata).not.toHaveProperty('note');
    await expect(
      new Model({
        ...input,
        eventType: 'POST_CLOSE_EDIT',
        metadata: {
          changedArea: 'FREE_TEXT',
          previousRevision: 2,
          newRevision: 3,
        },
      }).validate(),
    ).rejects.toThrow();
    await expect(
      new Model({
        ...input,
        eventType: 'POST_CLOSE_EDIT',
        metadata: {
          changedArea: 'VALUE',
          changedCount: -1,
        },
      }).validate(),
    ).rejects.toThrow();
  });
});

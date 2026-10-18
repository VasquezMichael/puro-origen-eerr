import { PostCloseEditService } from './post-close-edit.service.js';
import type { EerrAuditChangedArea } from '@puro-origen/shared-types';

const branchId = '123456789012345678901234';
const actor = '222222222222222222222222';
const areas: EerrAuditChangedArea[] = [
  'VALUE',
  'QUANTITY',
  'NOTE',
  'STRUCTURE',
  'SALES_GOAL',
  'IMPORT',
  'COMPLETE_PENDING',
  'GLOBAL_STRUCTURE',
];

function harness(status: 'OPEN' | 'CLOSED' = 'CLOSED') {
  let row = {
    _id: 'eerr',
    branchId,
    revision: 3,
    lifecycleStatus: status,
    deletedAt: null as Date | null,
  };
  const events: {
    eventType: string;
    revision: number;
    metadata: Record<string, unknown>;
  }[] = [];
  const session = { marker: 'same-session' };
  let appendSession: unknown;
  let failAudit = false;
  const store = {
    get: async () => (row.deletedAt === null ? { ...row } : null),
    transaction: async <T>(work: (session: unknown) => Promise<T>) => {
      const before = { ...row },
        count = events.length;
      try {
        return await work(session);
      } catch (error) {
        row = before;
        events.splice(count);
        throw error;
      }
    },
  };
  const audit = {
    append: async (event: (typeof events)[number], usedSession: unknown) => {
      if (failAudit) throw new Error('audit failed');
      appendSession = usedSession;
      events.push(event);
    },
  };
  const service = new PostCloseEditService(
    store as never,
    audit as never,
    { now: () => new Date('2026-10-17T12:00:00Z') } as never,
  );
  return {
    service,
    events,
    session,
    get row() {
      return row;
    },
    get appendSession() {
      return appendSession;
    },
    setStatus(value: 'OPEN' | 'CLOSED') {
      row.lifecycleStatus = value;
    },
    failAudit() {
      failAudit = true;
    },
    delete() {
      row.deletedAt = new Date('2026-10-17T12:00:00Z');
    },
    edit: async (area: EerrAuditChangedArea, fail = false) =>
      service.run('eerr', actor, area, async () => {
        row.revision++;
        if (fail) throw new Error('write failed');
        return {
          response: row.revision,
          updated: { revision: row.revision },
          changedCount: area === 'IMPORT' ? 2 : undefined,
        };
      }),
  };
}

it.each(areas)(
  'emite un solo evento acotado para %s cerrado, con la misma sesión',
  async (area) => {
    const h = harness();
    expect(await h.edit(area)).toBe(4);
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({
      eventType: 'POST_CLOSE_EDIT',
      revision: 4,
      metadata: { changedArea: area, previousRevision: 3, newRevision: 4 },
    });
    expect(h.appendSession).toBe(h.session);
    expect(Object.keys(h.events[0]!.metadata)).toEqual(
      area === 'IMPORT'
        ? ['changedArea', 'previousRevision', 'newRevision', 'changedCount']
        : ['changedArea', 'previousRevision', 'newRevision'],
    );
  },
);

it('OPEN y no-op no emiten evento', async () => {
  const h = harness('OPEN');
  await h.edit('VALUE');
  expect(h.events).toHaveLength(0);
  h.setStatus('CLOSED');
  await h.service.run('eerr', actor, 'STRUCTURE', async () => ({
    response: 'unchanged',
  }));
  expect(h.events).toHaveLength(0);
});

it('soft-deleted no se modifica ni audita', async () => {
  const h = harness();
  h.delete();
  await expect(h.edit('VALUE')).rejects.toMatchObject({ status: 404 });
  expect(h.row.revision).toBe(3);
  expect(h.events).toHaveLength(0);
});

it('usa el estado persistido al comenzar la transacción: carreras OPEN/CLOSED y CLOSED/OPEN', async () => {
  const h = harness('OPEN');
  h.setStatus('CLOSED');
  await h.edit('VALUE');
  expect(h.events).toHaveLength(1);
  h.setStatus('OPEN');
  await h.edit('NOTE');
  expect(h.events).toHaveLength(1);
});

it('ante fallo de escritura o auditoría revierte la operación', async () => {
  const h = harness();
  await expect(h.edit('VALUE', true)).rejects.toThrow('write failed');
  expect(h.row.revision).toBe(3);
  h.failAudit();
  await expect(h.edit('VALUE')).rejects.toThrow('audit failed');
  expect(h.row.revision).toBe(3);
  expect(h.events).toHaveLength(0);
  expect(h.events).toHaveLength(0);
  await expect(
    h.service.run('eerr', actor, 'VALUE', async () => ({
      response: 1,
      updated: { revision: 5 },
    })),
  ).rejects.toThrow('revisión');
  expect(h.row.revision).toBe(3);
});

it('incluye changedCount solo para operaciones que lo aportan', async () => {
  const h = harness();
  await h.edit('IMPORT');
  expect(h.events[0]?.metadata.changedCount).toBe(2);
});

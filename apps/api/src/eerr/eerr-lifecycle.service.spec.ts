import { EerrLifecycleService } from './eerr-lifecycle.service.js';

const id = '11111111-1111-4111-8111-111111111111';
const branchId = '123456789012345678901234';
const userId = '222222222222222222222222';
const viewer = (isAdmin = true, role = 'EDITOR', assigned = true) => ({
  sub: userId,
  isAdmin,
  branchAccesses: assigned ? [{ branchId, role }] : [],
});

type Row = {
  _id: string; branchId: string; year: number; month: number;
  loadStatus: string; createdBy: string; createdAt: Date; updatedAt: Date;
  revision: number; lifecycleStatus?: string; everClosed?: boolean;
  closedAt?: Date; closedBy?: string; deletedAt?: Date; deletedBy?: string;
  structure?: unknown;
};

function setup(
  initial: Record<string, unknown> = {},
  enabled = false,
  configValue?: string,
) {
  let row: Row = {
    _id: id,
    branchId,
    year: 2026,
    month: 8,
    loadStatus: 'SIN_CARGAR',
    createdBy: userId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    revision: 0,
    ...initial,
  };
  const events: unknown[] = [];
  const readAuthorized = vi.fn(async () => {
    if (row.deletedAt) throw new Error('not found');
    return row;
  });
  const append = vi.fn(async (event: unknown, session: unknown) => {
    expect(session).toBe(sessionToken);
    events.push(event);
  });
  const sessionToken = {};
  const transition = vi.fn(async (_id: string, revision: number, from: string, to: string, actor: string, now: Date, session: unknown) => {
    expect(session).toBe(sessionToken);
    if (row.deletedAt || row.revision !== revision || (row.lifecycleStatus ?? 'OPEN') !== from ||
      (to === 'DELETED' && (row.everClosed ?? false))) return null;
    row = {
      ...row,
      revision: revision + 1,
      updatedAt: now,
      ...(to === 'CLOSED' ? { lifecycleStatus: 'CLOSED', everClosed: true, closedAt: now, closedBy: actor } :
        to === 'OPEN' ? { lifecycleStatus: 'OPEN' } : { deletedAt: now, deletedBy: actor }),
    };
    return row;
  });
  const transaction = vi.fn(async (work: (session: unknown) => Promise<unknown>) => {
    const before = row;
    const eventCount = events.length;
    try { return await work(sessionToken); }
    catch (error) {
      // Una operación fallida no revierte el commit de otra concurrente.
      if (events.length === eventCount) row = before;
      throw error;
    }
  });
  const service = new EerrLifecycleService(
    { readAuthorized } as never,
    { transaction, get: vi.fn(async () => row.deletedAt ? null : row), transition } as never,
    { append } as never,
    { now: () => new Date('2026-10-16T12:00:00Z') } as never,
    { get: () => configValue ?? (enabled ? 'true' : undefined) } as never,
  );
  return { service, getRow: () => row, events, append, transition, transaction, readAuthorized };
}

describe('transiciones de lifecycle', () => {
  it('cierra OPEN legacy, aumenta revisión y registra un solo evento en la sesión', async () => {
    const t = setup();
    const result = await t.service.close(id, 0, viewer() as never);
    expect(result).toMatchObject({ lifecycleStatus: 'CLOSED', everClosed: true, revision: 1, pendingAmountCount: 0 });
    expect(t.getRow()).toMatchObject({ closedBy: userId });
    expect(t.events).toHaveLength(1);
    expect(t.events[0]).toMatchObject({ eventType: 'EERR_CLOSED', revision: 1 });
    await expect(t.service.close(id, 1, viewer() as never)).rejects.toMatchObject({ status: 409 });
    expect(t.events).toHaveLength(1);
  });

  it('avisa solo importes activos SIN_CARGAR, sin contar cantidades ni archivados', async () => {
    const node = (state: string, archive?: string) => ({ kind: 'ITEM', nodeId: state + archive, code: state + archive,
      amount: { state, value: null, input: null, currency: 'ARS', scale: 2 },
      quantity: { state: 'SIN_CARGAR', value: null }, archive: archive ? { state: archive } : undefined });
    const structure = { schemaVersion: 1, structureVersion: 1, initializedAt: new Date(), initializedBy: userId,
      nodes: [node('SIN_CARGAR'), node('CARGADO'), node('SIN_CARGAR', 'ARCHIVED')] };
    const t = setup({ structure });
    expect((await t.service.close(id, 0, viewer() as never)).pendingAmountCount).toBe(1);
    expect(t.getRow().structure).toBe(structure);
  });

  it('sin importes pendientes informa cero aunque una cantidad opcional siga sin cargar', async () => {
    const t = setup({ structure: { schemaVersion: 1, structureVersion: 1,
      initializedAt: new Date(), initializedBy: userId,
      nodes: [{ kind: 'ITEM', nodeId: 'item', code: 'item', amount: {
        state: 'CARGADO', value: { toString: () => '0.00' }, input: '0', currency: 'ARS', scale: 2,
      }, quantity: { state: 'SIN_CARGAR', value: null } }],
    } });
    expect((await t.service.close(id, 0, viewer() as never)).pendingAmountCount).toBe(0);
  });

  it('reabre CLOSED sin borrar el último cierre ni everClosed', async () => {
    const closedAt = new Date('2026-09-01T00:00:00Z');
    const t = setup({ lifecycleStatus: 'CLOSED', everClosed: true, closedAt, closedBy: userId });
    const result = await t.service.reopen(id, 0, viewer() as never);
    expect(result).toMatchObject({ lifecycleStatus: 'OPEN', everClosed: true, closedBy: userId, revision: 1 });
    expect(t.getRow().closedAt).toBe(closedAt);
    expect(t.events).toHaveLength(1);
    await expect(t.service.reopen(id, 1, viewer() as never)).rejects.toMatchObject({ status: 409 });
  });

  it.each([undefined, 'false', 'otro'])(
    'DELETE con flag %s responde 503 antes de leer o escribir',
    async (configValue) => {
      const t = setup({}, false, configValue);
      await expect(t.service.delete(id, 0, viewer() as never)).rejects.toMatchObject({ status: 503 });
      expect(t.readAuthorized).not.toHaveBeenCalled();
      expect(t.transaction).not.toHaveBeenCalled();
      expect(t.transition).not.toHaveBeenCalled();
      expect(t.append).not.toHaveBeenCalled();
      expect(t.events).toHaveLength(0);
      expect(t.getRow().revision).toBe(0);
    },
  );

  it('elimina por soft delete un OPEN legacy nunca cerrado, y rechaza CLOSED o reabierto', async () => {
    const t = setup({}, true);
    const result = await t.service.delete(id, 0, viewer() as never);
    expect(result).toMatchObject({ revision: 1, deletedBy: userId });
    expect(t.events).toHaveLength(1);
    expect(t.events[0]).toMatchObject({ eventType: 'EERR_DELETED' });
    for (const state of [{ lifecycleStatus: 'CLOSED', everClosed: true }, { lifecycleStatus: 'OPEN', everClosed: true }]) {
      const blocked = setup(state, true);
      await expect(blocked.service.delete(id, 0, viewer() as never)).rejects.toMatchObject({ status: 409 });
      expect(blocked.events).toHaveLength(0);
    }
  });

  it.each(['close', 'reopen', 'delete'] as const)('%s exige revisión vigente', async (operation) => {
    const t = setup(operation === 'reopen' ? { lifecycleStatus: 'CLOSED', everClosed: true } : {}, true);
    await expect(t.service[operation](id, 9, viewer() as never)).rejects.toMatchObject({ status: 409 });
    expect(t.events).toHaveLength(0);
  });

  it.each(['close', 'reopen', 'delete'] as const)('%s exige Admin o Editor asignado', async (operation) => {
    for (const actor of [viewer(false, 'READER'), viewer(false, 'EDITOR', false)]) {
      const t = setup(operation === 'reopen' ? { lifecycleStatus: 'CLOSED', everClosed: true } : {}, true);
      await expect(t.service[operation](id, 0, actor as never)).rejects.toMatchObject({ status: 403 });
      expect(t.events).toHaveLength(0);
    }
  });

  it('Editor asignado puede cerrar; edición concurrente vs cierre pierde el CAS sin evento', async () => {
    const editor = setup();
    await expect(editor.service.close(id, 0, viewer(false) as never)).resolves.toMatchObject({ revision: 1 });
    const race = setup();
    race.transition.mockImplementationOnce(async () => { race.getRow().revision = 1; return null; });
    await expect(race.service.close(id, 0, viewer() as never)).rejects.toMatchObject({ status: 409 });
    expect(race.events).toHaveLength(0);
  });

  it('borrado entre lectura y escritura impide la transición y no agrega auditoría', async () => {
    const t = setup();
    t.transition.mockImplementationOnce(async () => { t.getRow().deletedAt = new Date(); return null; });
    await expect(t.service.close(id, 0, viewer() as never)).rejects.toMatchObject({ status: 409 });
    expect(t.events).toHaveLength(0);
  });

  it.each([
    ['close', {}],
    ['reopen', { lifecycleStatus: 'CLOSED', everClosed: true }],
  ] as const)('dos %s simultáneos no duplican el evento', async (operation, initial) => {
    const t = setup(initial);
    const results = await Promise.allSettled([
      t.service[operation](id, 0, viewer() as never),
      t.service[operation](id, 0, viewer() as never),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(t.events).toHaveLength(1);
  });

  it('cierre y eliminación simultáneos admiten un solo ganador', async () => {
    const t = setup({}, true);
    const results = await Promise.allSettled([
      t.service.close(id, 0, viewer() as never),
      t.service.delete(id, 0, viewer() as never),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(t.events).toHaveLength(1);
  });

  it('rollback ante fallo de auditoría conserva lifecycle y no confirma evento', async () => {
    const t = setup();
    t.append.mockRejectedValueOnce(new Error('audit failed'));
    await expect(t.service.close(id, 0, viewer() as never)).rejects.toThrow('audit failed');
    expect(t.getRow()).not.toHaveProperty('lifecycleStatus');
    expect(t.events).toHaveLength(0);
  });

  it('CAS fallido no inserta evento', async () => {
    const t = setup();
    t.transition.mockResolvedValueOnce(null);
    await expect(t.service.close(id, 0, viewer() as never)).rejects.toMatchObject({ status: 409 });
    expect(t.append).not.toHaveBeenCalled();
  });
});

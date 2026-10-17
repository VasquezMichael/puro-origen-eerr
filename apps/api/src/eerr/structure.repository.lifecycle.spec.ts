import { StructureRepository } from './structure.repository.js';

function query(result: unknown = null) {
  const chain = {
    sort: vi.fn(), limit: vi.fn(), session: vi.fn(), lean: vi.fn(), exec: vi.fn(async () => result),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.session.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

it('filtra activos en lecturas directas, períodos y candidatos de clonación', async () => {
  const q = query([]);
  const model = { findOne: vi.fn(() => q), find: vi.fn(() => q) };
  const repo = new StructureRepository(model as never, {} as never);
  await repo.get('uuid');
  expect(model.findOne).toHaveBeenCalledWith({ _id: 'uuid', deletedAt: null });
  await repo.period(2026, 8);
  expect(model.find).toHaveBeenCalledWith({ year: 2026, month: 8, deletedAt: null });
  await repo.cloneCandidates(['branch'], 2026, 8);
  expect(model.find).toHaveBeenLastCalledWith(expect.objectContaining({ deletedAt: null }));
});

it('CAS de cierre usa id, revisión, estado OPEN legacy y activo, en la misma sesión', async () => {
  const q = query();
  const model = { findOneAndUpdate: vi.fn(() => q) };
  const repo = new StructureRepository(model as never, {} as never);
  const session = {};
  const now = new Date('2026-10-16T12:00:00Z');
  await repo.transition('uuid', 0, 'OPEN', 'CLOSED', '123456789012345678901234', now, session as never);
  const [filter, update, options] = model.findOneAndUpdate.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
  expect(filter).toEqual({
    _id: 'uuid', deletedAt: null,
    $and: [
      { $or: [{ revision: 0 }, { revision: { $exists: false } }] },
      { $or: [{ lifecycleStatus: 'OPEN' }, { lifecycleStatus: { $exists: false } }] },
    ],
  });
  expect(update).toMatchObject({ $inc: { revision: 1 }, $set: { lifecycleStatus: 'CLOSED', everClosed: true } });
  expect(options.session).toBe(session);
});

it('CAS de DELETE exige que jamás se haya cerrado, incluso en legacy', async () => {
  const q = query();
  const model = { findOneAndUpdate: vi.fn(() => q) };
  const repo = new StructureRepository(model as never, {} as never);
  await repo.transition('uuid', 2, 'OPEN', 'DELETED', '123456789012345678901234', new Date(), {} as never);
  const filter = (model.findOneAndUpdate.mock.calls as unknown as [Record<string, unknown>][])[0]![0];
  expect(filter).toMatchObject({ _id: 'uuid', deletedAt: null });
  expect(filter.$and).toEqual([
    { revision: 2 },
    { $or: [{ lifecycleStatus: 'OPEN' }, { lifecycleStatus: { $exists: false } }] },
    { $or: [{ everClosed: false }, { everClosed: { $exists: false } }] },
  ]);
});

it('todas las escrituras de estructura/importación/clonación rechazan borrados entre lectura y CAS', async () => {
  const q = query({ revision: 1 });
  const model = { findOneAndUpdate: vi.fn(() => q) };
  const repo = new StructureRepository(model as never, {} as never);
  const structure = { schemaVersion: 1, structureVersion: 1,
    initializedAt: '2026-10-16T12:00:00Z', initializedBy: 'actor', nodes: [] };
  await repo.initializeClone('uuid', structure as never, new Date(), {} as never);
  await repo.writeImport('uuid', 1, structure as never, [], new Date(), {} as never);
  await repo.write('uuid', 1, structure as never);
  await repo.writeOrder('uuid', 1, []);
  await repo.writeArchive('uuid', 1, 'item', { state: 'ARCHIVED', at: '2026-10-16T12:00:00Z', by: 'actor' }, 'SIN_CARGAR');
  await repo.writeNote('uuid', 1, 'nota');
  const filters = (model.findOneAndUpdate.mock.calls as unknown as [Record<string, unknown>][]).map(([filter]) => filter);
  expect(filters).toHaveLength(6);
  for (const filter of filters) expect(filter).toMatchObject({ _id: 'uuid', deletedAt: null });
});

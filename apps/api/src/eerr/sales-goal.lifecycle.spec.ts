import { SalesGoalService } from './sales-goal.service.js';

it('la escritura de meta usa CAS activo aunque el EERR sea borrado después de la lectura', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const branchId = '123456789012345678901234';
  const userId = '222222222222222222222222';
  let filter: Record<string, unknown> | undefined;
  const model = {
    findOneAndUpdate: (input: Record<string, unknown>) => {
      filter = input;
      return { exec: async () => null };
    },
  };
  const service = new SalesGoalService(
    model as never,
    { readAuthorized: async () => ({ _id: id, branchId, revision: 0, structure: { nodes: [] }, salesGoal: null }) } as never,
    { now: () => new Date('2026-10-16T12:00:00Z') } as never,
  );
  await expect(service.put(id, { expectedRevision: 0, goal: { mode: 'NET_PROFIT_AMOUNT', value: '100.00' } },
    { sub: userId, isAdmin: true, branchAccesses: [] } as never)).rejects.toMatchObject({ status: 409 });
  expect(filter).toMatchObject({ _id: id, deletedAt: null, $or: [{ revision: 0 }, { revision: { $exists: false } }] });
});

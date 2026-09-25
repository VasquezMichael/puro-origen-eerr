import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import request from 'supertest';
import { ROOTS, type EerrStructure } from '@puro-origen/domain';
import { AuthGuard } from '../auth/auth.guard.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { SessionTokenService } from '../auth/session-token.service.js';
import { UsersService } from '../users/users.service.js';
import { BranchRole } from '../users/user-role.js';
import { BranchesService } from '../branches/branches.service.js';
import {
  fixtureBranch,
  fixtureOtherBranch,
  fixtureUser,
  MemoryStructureRepository,
} from '../../test/structure.fixture.js';
import { Eerr, type EerrDocument } from './schemas/eerr.schema.js';
import { storedStructure } from './schemas/structure.schema.js';
import { EerrService } from './eerr.service.js';
import { SalesGoalController } from './sales-goal.controller.js';
import { SalesGoalService } from './sales-goal.service.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';
import { EerrClock } from './eerr-clock.js';

describe('EP-05B.1 HTTP: meta por EERR', () => {
  let app: INestApplication;
  let store = new MemoryStructureRepository();
  let id: string;
  let viewer = {
    id: fixtureUser,
    active: true,
    isAdmin: true,
    branchAccesses: [] as { branchId: string; role: BranchRole }[],
  };
  const put = (body: Record<string, unknown>, target = id) =>
    request(app.getHttpServer())
      .put(`/eerr/${target}/sales-goal`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send(body);
  const get = () =>
    request(app.getHttpServer())
      .get(`/eerr/${id}/analysis`)
      .set('Cookie', `${SESSION_COOKIE}=offline`);
  beforeAll(async () => {
    const branches = {
      list: async () =>
        [fixtureBranch, fixtureOtherBranch]
          .filter(
            (branchId) =>
              viewer.isAdmin ||
              viewer.branchAccesses.some(
                (access) => access.branchId === branchId,
              ),
          )
          .map((branchId) => ({ id: branchId, active: false })),
    };
    const model = {
      findOne: (filter: { _id: string; branchId: { $in: string[] } }) => ({
        exec: async () =>
          store.state.rows.find(
            (row) =>
              row._id === filter._id &&
              filter.branchId.$in.includes(row.branchId.toString()),
          ) ?? null,
      }),
      findOneAndUpdate: (
        filter: {
          _id: string;
          revision?: number;
          $or?: unknown;
          structure: unknown;
        },
        update: {
          $set?: { salesGoal?: EerrDocument['salesGoal']; updatedAt: Date };
          $unset?: unknown;
          $inc: { revision: number };
        },
      ) => ({
        exec: async () => {
          const row = store.state.rows.find(
            (candidate) =>
              candidate._id === filter._id &&
              candidate.structure != null &&
              (candidate.revision ?? 0) === (filter.revision ?? 0),
          );
          if (!row) return null;
          if (update.$unset) row.salesGoal = undefined;
          else row.salesGoal = update.$set!.salesGoal;
          row.updatedAt = update.$set!.updatedAt;
          row.revision = (row.revision ?? 0) + update.$inc.revision;
          store.writes++;
          return row;
        },
      }),
    };
    const eerrs = new EerrService(
      model as unknown as Model<EerrDocument>,
      branches as unknown as BranchesService,
      { now: () => new Date('2026-09-15T12:00:00Z') },
    );
    const module = await Test.createTestingModule({
      controllers: [SalesGoalController, AnalysisController],
      providers: [
        SalesGoalService,
        AnalysisService,
        Reflector,
        { provide: APP_GUARD, useClass: AuthGuard },
        {
          provide: UsersService,
          useValue: {
            findActiveById: async () => (viewer.active ? viewer : null),
          },
        },
        {
          provide: SessionTokenService,
          useValue: { verify: async () => ({ sub: fixtureUser }) },
        },
        { provide: EerrService, useValue: eerrs },
        { provide: getModelToken(Eerr.name), useValue: model },
        {
          provide: EerrClock,
          useValue: { now: () => new Date('2026-09-15T13:00:00Z') },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app?.close());
  beforeEach(() => {
    store = new MemoryStructureRepository();
    const row = store.seed();
    id = row._id;
    row.revision = 1;
    const nodes = ROOTS.map((root, position) => ({
      nodeId: randomUUID(),
      code: root.code,
      parentId: null,
      position,
      name: root.name,
      kind: 'BLOCK' as const,
    }));
    const snapshot: EerrStructure = {
      schemaVersion: 1,
      structureVersion: 1,
      initializedAt: '2026-09-15T12:00:00Z',
      initializedBy: fixtureUser,
      nodes,
    };
    row.structure = storedStructure(snapshot);
    viewer = {
      id: fixtureUser,
      active: true,
      isAdmin: true,
      branchAccesses: [],
    };
  });

  it('crea, lee, cambia, hace no-op y elimina sin escribir desde GET', async () => {
    expect((await get().expect(200)).body.salesGoal).toBeNull();
    const created = await put({
      expectedRevision: 1,
      goal: { mode: 'NET_MARGIN_PERCENT', value: '10' },
    }).expect(200);
    expect(created.body).toMatchObject({
      revision: 2,
      salesGoal: { mode: 'NET_MARGIN_PERCENT', value: '10.0000' },
    });
    const writes = store.writes;
    await put({
      expectedRevision: 2,
      goal: { mode: 'NET_MARGIN_PERCENT', value: '10.0000' },
    }).expect(200);
    expect(store.writes).toBe(writes);
    expect((await get().expect(200)).body).toMatchObject({
      sourceRevision: 2,
      salesGoal: { value: '10.0000' },
    });
    expect(store.writes).toBe(writes);
    await put({
      expectedRevision: 2,
      goal: { mode: 'NET_PROFIT_AMOUNT', value: '5' },
    }).expect(200);
    await put({ expectedRevision: 3, goal: null }).expect(200);
    expect((await get().expect(200)).body.salesGoal).toBeNull();
  });

  it('rechaza revisión obsoleta, doble envío y contrato inválido', async () => {
    const body = {
      expectedRevision: 1,
      goal: { mode: 'NET_PROFIT_AMOUNT', value: '1.00' },
    };
    await put(body).expect(200);
    await put(body).expect(409);
    for (const invalid of [
      { ...body, extra: 1 },
      { ...body, goal: { ...body.goal, extra: 1 } },
      { ...body, goal: { mode: 'NET_MARGIN_PERCENT', value: '100.0000' } },
      { ...body, goal: { mode: 'NET_MARGIN_PERCENT', value: '1.00001' } },
      { ...body, goal: { mode: 'NET_PROFIT_AMOUNT', value: '-1.00' } },
      {
        ...body,
        goal: { mode: 'NET_PROFIT_AMOUNT', value: '1000000000000.00' },
      },
      { ...body, goal: { mode: 'NET_PROFIT_AMOUNT', value: '1.001' } },
    ])
      await put({ ...invalid, expectedRevision: 2 }).expect(400);
    await put({ expectedRevision: 2, goal: null }, 'bad').expect(400);
  });

  it('aplica Admin/Editor/Lector/ajeno y exige estructura inicializada', async () => {
    const body = {
      expectedRevision: 1,
      goal: { mode: 'NET_PROFIT_AMOUNT', value: '1.00' },
    };
    viewer = {
      ...viewer,
      isAdmin: false,
      branchAccesses: [{ branchId: fixtureBranch, role: BranchRole.READER }],
    };
    await get().expect(200);
    await put(body).expect(403);
    viewer.branchAccesses = [
      { branchId: fixtureOtherBranch, role: BranchRole.EDITOR },
    ];
    await put(body).expect(404);
    viewer.branchAccesses = [
      { branchId: fixtureBranch, role: BranchRole.EDITOR },
    ];
    await put(body).expect(200);
    store.state.rows[0]!.structure = null;
    await put({ expectedRevision: 2, goal: null }).expect(400);
  });
});

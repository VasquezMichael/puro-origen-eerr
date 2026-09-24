import { type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
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
import type { EerrDocument } from './schemas/eerr.schema.js';
import { storedStructure } from './schemas/structure.schema.js';
import { EerrService } from './eerr.service.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';

describe('EP-05A.1 HTTP: análisis de una revisión autorizada', () => {
  let app: INestApplication;
  let store = new MemoryStructureRepository();
  let id: string;
  let viewer: {
    id: string;
    active: boolean;
    isAdmin: boolean;
    branchAccesses: { branchId: string; role: BranchRole }[];
  };
  const read = (target = id) =>
    request(app.getHttpServer())
      .get(`/eerr/${target}/analysis`)
      .set('Cookie', `${SESSION_COOKIE}=offline`);
  const structure = (
    income: string,
    cost: string,
    expense: string,
  ): EerrStructure => {
    const roots = ROOTS.map((root, position) => ({
      nodeId: randomUUID(),
      code: root.code,
      parentId: null,
      position,
      name: root.name,
      kind: 'BLOCK' as const,
    }));
    return {
      schemaVersion: 1,
      structureVersion: 1,
      initializedAt: '2026-09-15T12:00:00.000Z',
      initializedBy: fixtureUser,
      nodes: [
        ...roots,
        ...[income, cost, expense].map((value, index) => ({
          nodeId: randomUUID(),
          code: randomUUID(),
          parentId: roots[index]!.nodeId,
          position: 0,
          name: `Ítem ${index}`,
          kind: 'ITEM' as const,
          amount: {
            state: 'CARGADO' as const,
            input: null,
            value,
            currency: 'ARS' as const,
            scale: 2 as const,
          },
        })),
      ],
    };
  };
  beforeAll(async () => {
    const branches = {
      list: async (principal: {
        isAdmin: boolean;
        branchAccesses: { branchId: string }[];
      }) =>
        [fixtureBranch, fixtureOtherBranch]
          .filter(
            (branchId) =>
              principal.isAdmin ||
              principal.branchAccesses.some((a) => a.branchId === branchId),
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
    };
    const module = await Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [
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
        {
          provide: EerrService,
          useValue: new EerrService(
            model as unknown as Model<EerrDocument>,
            branches as unknown as BranchesService,
            { now: () => new Date('2026-09-15T12:00:00Z') },
          ),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app?.close());
  beforeEach(() => {
    store = new MemoryStructureRepository();
    const row = store.seed();
    id = row._id;
    viewer = {
      id: fixtureUser,
      active: true,
      isAdmin: true,
      branchAccesses: [],
    };
  });

  it('sin inicializar devuelve 200 sin escrituras, bloques vacíos y razón explícita', async () => {
    const row = store.state.rows[0]!;
    const before = { revision: row.revision, updatedAt: row.updatedAt };
    const response = await read().expect(200);
    expect(response.body).toMatchObject({
      eerrId: id,
      sourceRevision: 0,
      initialized: false,
      currency: 'ARS',
      blocks: [],
      categories: [],
      metrics: {
        grossMargin: {
          status: 'BLOCKED',
          value: null,
          reason: 'UNINITIALIZED',
        },
      },
    });
    expect({ revision: row.revision, updatedAt: row.updatedAt }).toEqual(
      before,
    );
    expect(store.writes).toBe(0);
  });

  it.each([
    ['Administrador', true, []],
    ['Editor', false, [{ branchId: fixtureBranch, role: BranchRole.EDITOR }]],
    ['Lector', false, [{ branchId: fixtureBranch, role: BranchRole.READER }]],
  ] as const)(
    '%s lee histórico inactivo con Decimal128 exacto y revisión',
    async (_label, isAdmin, accesses) => {
      viewer = { ...viewer, isAdmin, branchAccesses: [...accesses] };
      const row = store.state.rows[0]!;
      row.revision = 7;
      row.structure = storedStructure(
        structure('999999999999.99', '0.00', '1.00'),
      );
      const before = row.updatedAt;
      const response = await read().expect(200);
      expect(response.body.sourceRevision).toBe(7);
      expect(
        response.body.blocks.map((block: { value: string }) => block.value),
      ).toEqual(['999999999999.99', '0.00', '1.00']);
      expect(response.body.metrics.netResult).toMatchObject({
        status: 'COMPLETE',
        value: '999999999998.99',
        unit: 'ARS',
        reason: null,
      });
      expect(typeof response.body.metrics.netResultPercent.value).toBe(
        'string',
      );
      expect(row.updatedAt).toBe(before);
      expect(store.writes).toBe(0);
    },
  );

  it('ajeno e inexistente son 404; UUID inválido 400; sin sesión 401', async () => {
    viewer = {
      ...viewer,
      isAdmin: false,
      branchAccesses: [
        { branchId: fixtureOtherBranch, role: BranchRole.READER },
      ],
    };
    await read().expect(404);
    await read(randomUUID()).expect(404);
    await read('bad').expect(400);
    await request(app.getHttpServer()).get(`/eerr/${id}/analysis`).expect(401);
  });

  it('persistencia inválida falla 500 con código estable sin detalles BSON ni escritura', async () => {
    const row = store.state.rows[0]!;
    row.structure = storedStructure(structure('1.00', '1.00', '1.00'));
    row.structure.nodes[3]!.amount!.value = null;
    const response = await read().expect(500);
    expect(response.body).toMatchObject({
      code: 'INVALID_PERSISTED_DATA',
      message: 'No se pudo calcular el EERR con los datos guardados',
    });
    expect(JSON.stringify(response.body)).not.toContain('BSON');
    expect(store.writes).toBe(0);
  });
});

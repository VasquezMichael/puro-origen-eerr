import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import { initialNodes, emptyAmount } from '@puro-origen/domain';
import { CompletePendingController } from './complete-pending.controller.js';
import { CompletePendingService } from './complete-pending.service.js';
import { ImportToken } from './import/import-token.js';
import { EerrClock } from './eerr-clock.js';
import { EerrService } from './eerr.service.js';
import { StructureRepository } from './structure.repository.js';
import { storedStructure } from './schemas/structure.schema.js';
import type { EerrDocument } from './schemas/eerr.schema.js';
import { BranchesService } from '../branches/branches.service.js';
import { BranchRole } from '../users/user-role.js';
import { UsersService } from '../users/users.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { SessionTokenService } from '../auth/session-token.service.js';
import {
  MemoryStructureRepository,
  fixtureBranch,
  fixtureOtherBranch,
  fixtureUser,
  fixtureNow,
} from '../../test/structure.fixture.js';
describe('EP-04C3 HTTP aislado', () => {
  let app: INestApplication,
    store = new MemoryStructureRepository(),
    row: ReturnType<MemoryStructureRepository['seed']>,
    now: Date;
  let viewer: {
    id: string;
    active: boolean;
    isAdmin: boolean;
    branchAccesses: { branchId: string; role: BranchRole }[];
  };
  const branches = {
    list: async (principal: {
      isAdmin: boolean;
      branchAccesses: { branchId: string }[];
    }) =>
      [fixtureBranch, fixtureOtherBranch]
        .filter(
          (id) =>
            principal.isAdmin ||
            principal.branchAccesses.some((a) => a.branchId === id),
        )
        .map((id) => ({ id, name: 'Sucursal de prueba', active: false })),
  };
  beforeAll(async () => {
    const model = {
      findOne: (filter: { _id: string; branchId: { $in: string[] } }) => ({
        exec: async () =>
          store.state.rows.find(
            (r) =>
              r._id === filter._id &&
              filter.branchId.$in.includes(r.branchId.toString()),
          ) ?? null,
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [CompletePendingController],
      providers: [
        CompletePendingService,
        ImportToken,
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
          provide: ConfigService,
          useValue: new ConfigService({
            JWT_SECRET: 'test-only-not-real-secret-0000000000000000',
          }),
        },
        { provide: EerrClock, useValue: { now: () => new Date(now) } },
        { provide: BranchesService, useValue: branches },
        {
          provide: EerrService,
          useValue: new EerrService(
            model as unknown as Model<EerrDocument>,
            branches as unknown as BranchesService,
            { now: () => new Date(now) },
          ),
        },
        {
          provide: StructureRepository,
          useFactory: () =>
            new Proxy(
              {},
              {
                get: (_target, prop) => {
                  const value = store[prop as keyof MemoryStructureRepository];
                  return typeof value === 'function'
                    ? value.bind(store)
                    : value;
                },
              },
            ),
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
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    store = new MemoryStructureRepository();
    now = new Date(fixtureNow);
    viewer = {
      id: fixtureUser,
      active: true,
      isAdmin: true,
      branchAccesses: [],
    };
    row = store.seed();
    const nodes = initialNodes([], randomUUID);
    for (let i = 0; i < 6; i++)
      nodes.push({
        nodeId: randomUUID(),
        code: randomUUID(),
        kind: 'ITEM',
        name: 'Ítem ' + i,
        parentId: nodes[0].nodeId,
        position: i,
        amount:
          i === 0 || i === 3
            ? {
                ...emptyAmount(),
                state: 'CARGADO',
                input: i === 0 ? '5+5' : '0',
                value: i === 0 ? '10.00' : '0.00',
              }
            : emptyAmount(),
        ...(i === 4
          ? {}
          : {
              quantity:
                i === 1
                  ? { state: 'SIN_CARGAR' as const, value: null }
                  : { state: 'CARGADO' as const, value: '17' },
            }),
        note: 'Nota que permanece',
        ...(i === 2 || i === 5
          ? {
              archive: {
                state: 'ARCHIVED' as const,
                at: fixtureNow.toISOString(),
                by: fixtureUser,
              },
            }
          : {}),
      });
    row.structure = storedStructure({
      schemaVersion: 1,
      structureVersion: 4,
      initializedAt: fixtureNow.toISOString(),
      initializedBy: fixtureUser,
      nodes,
    });
    row.revision = 5;
    row.note = 'Nota general que permanece';
  });

  const post = (kind: string, body: object = {}, id = row._id) =>
    request(app.getHttpServer())
      .post(`/eerr/${id}/amounts/complete-pending/${kind}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send(body);
  const state = () => JSON.stringify(store.state);
  it('preview sin escrituras, contexto, pendientes exactos y progreso', async () => {
    const before = state(),
      r = await post('preview');
    expect(r.status).toBe(201);
    expect(state()).toBe(before);
    expect(store.writes).toBe(0);
    expect(r.body.before).toEqual({
      total: 4,
      loaded: 2,
      pending: 2,
      status: 'PARCIAL',
    });
    expect(r.body.after).toEqual({
      total: 4,
      loaded: 4,
      pending: 0,
      status: 'CARGADO',
    });
    expect(r.body.affected.map((n: { name: string }) => n.name)).toEqual([
      'Ítem 1',
      'Ítem 4',
    ]);
    expect(r.body.destination).toMatchObject({
      id: row._id,
      branchName: 'Sucursal de prueba',
      year: 2026,
      month: 9,
    });
    expect(r.body.revision).toBe(5);
  });
  it('confirmación conserva todo salvo importes pendientes, progreso, revisión y updatedAt', async () => {
    const before = await store.get(row._id),
      p = await post('preview');
    now = new Date(now.getTime() + 1000);
    const r = await post('confirm', { previewToken: p.body.previewToken });
    expect(r.status).toBe(201);
    expect(r.body.affectedItems).toBe(2);
    const after = await store.get(row._id);
    expect(after!.revision).toBe(6);
    expect(after!.updatedAt).toEqual(now);
    const expected = before;
    for (const index of [4, 7])
      expected!.structure!.nodes[index].amount = {
        state: 'CARGADO',
        input: null,
        value: after!.structure!.nodes[index].amount!.value,
        currency: 'ARS',
        scale: 2,
      };
    expected!.revision = 6;
    expected!.loadStatus = after!.loadStatus;
    expected!.updatedAt = now;
    expect(after).toEqual(expected);
    for (const index of [4, 7])
      expect(r.body.result.structure.nodes[index].amount).toEqual({
        state: 'CARGADO',
        input: null,
        value: '0.00',
        currency: 'ARS',
        scale: 2,
      });
    expect(r.body.result.progress.status).toBe('CARGADO');
    expect(after).not.toHaveProperty('closedAt');
    expect(after).not.toHaveProperty('updatedBy');
  });
  it.each(['ADMIN', 'EDITOR', 'READER', 'ALIEN'])(
    'permisos %s, incluso sucursal inactiva',
    async (role) => {
      viewer.isAdmin = role === 'ADMIN';
      viewer.branchAccesses =
        role === 'ADMIN'
          ? []
          : [
              {
                branchId: role === 'ALIEN' ? fixtureOtherBranch : fixtureBranch,
                role: role === 'READER' ? BranchRole.READER : BranchRole.EDITOR,
              },
            ];
      const p = await post('preview');
      expect(p.status).toBe(
        role === 'READER' ? 403 : role === 'ALIEN' ? 404 : 201,
      );
      const before = state(),
        c = await post('confirm', {
          previewToken: p.body.previewToken ?? 'inventado',
        });
      expect(c.status).toBe(p.status);
      if (p.status !== 201) expect(state()).toBe(before);
    },
  );
  it.each(['no-cookie', 'inactive'])('sin sesión %s', async (kind) => {
    viewer.active = kind !== 'inactive';
    const r = await request(app.getHttpServer())
      .post(`/eerr/${row._id}/amounts/complete-pending/preview`)
      .set('Cookie', kind === 'no-cookie' ? '' : `${SESSION_COOKIE}=offline`)
      .send({});
    expect(r.status).toBe(401);
    expect(store.writes).toBe(0);
  });
  it('EERR inexistente', async () => {
    expect((await post('preview', {}, randomUUID())).status).toBe(404);
  });
  it('no inicializado', async () => {
    row.structure = null;
    expect((await post('preview')).status).toBe(400);
  });
  it.each(['empty', 'loaded', 'archived'])(
    'no-op %s sin revisión ni timestamp',
    async (kind) => {
      if (kind === 'empty')
        row.structure!.nodes = row.structure!.nodes.filter(
          (n) => n.kind !== 'ITEM',
        );
      else
        for (const n of row.structure!.nodes.filter((n) => n.kind === 'ITEM')) {
          if (kind === 'loaded')
            n.amount = { ...row.structure!.nodes[3].amount! };
          else
            n.archive = {
              state: 'ARCHIVED',
              at: fixtureNow.toISOString(),
              by: fixtureUser,
            };
        }
      const before = state(),
        p = await post('preview');
      expect(p.status).toBe(201);
      expect(p.body.previewToken).toBeNull();
      expect(p.body.affected).toEqual([]);
      expect(
        (await post('confirm', { previewToken: 'inventado' })).status,
      ).toBe(409);
      expect(state()).toBe(before);
      expect(store.writes).toBe(0);
    },
  );
  it.each(['amount', 'structure', 'note', 'quantity', 'archive'])(
    'cambio %s posterior produce 409 sin escrituras',
    async (kind) => {
      const p = await post('preview');
      row.revision++;
      if (kind === 'structure') row.structure!.structureVersion++;
      if (kind === 'note') row.note = 'Cambiada';
      const before = state();
      expect(
        (await post('confirm', { previewToken: p.body.previewToken })).status,
      ).toBe(409);
      expect(state()).toBe(before);
    },
  );
  it('recalcula ítems y huella aunque un cambio no avance revisión', async () => {
    const p = await post('preview');
    row.structure!.nodes[4].archive = {
      state: 'ARCHIVED',
      at: fixtureNow.toISOString(),
      by: fixtureUser,
    };
    const before = state();
    expect(
      (await post('confirm', { previewToken: p.body.previewToken })).status,
    ).toBe(409);
    expect(state()).toBe(before);
  });
  it.each(['expired', 'actor', 'signature', 'operation', 'permission'])(
    'token revalidado: %s',
    async (kind) => {
      const p = await post('preview');
      let token = p.body.previewToken;
      if (kind === 'expired') now = new Date(now.getTime() + 300000);
      if (kind === 'actor') viewer.id = '333333333333333333333333';
      if (kind === 'permission') {
        viewer.isAdmin = false;
        viewer.branchAccesses = [
          { branchId: fixtureBranch, role: BranchRole.READER },
        ];
      }
      if (kind === 'signature') token += 'x';
      if (kind === 'operation')
        token = app.get(ImportToken).sign({
          kind: 'preview',
          id: row._id,
          actor: viewer.id,
          identity: 'x',
          revision: 5,
          digest: 'x',
          planDigest: 'x',
          expires: now.getTime() + 300000,
        });
      const before = state();
      expect((await post('confirm', { previewToken: token })).status).toBe(
        kind === 'permission' ? 403 : 409,
      );
      expect(state()).toBe(before);
    },
  );
  it('concurrencia y reintento no duplican timestamp/revisión', async () => {
    const p = await post('preview');
    const r = await Promise.all([
      post('confirm', { previewToken: p.body.previewToken }),
      post('confirm', { previewToken: p.body.previewToken }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    const before = state();
    now = new Date(now.getTime() + 1000);
    expect(
      (await post('confirm', { previewToken: p.body.previewToken })).status,
    ).toBe(409);
    expect(state()).toBe(before);
    expect(store.writes).toBe(1);
  });
  it('fallo revierte lote completo', async () => {
    const p = await post('preview'),
      before = state();
    store.failWrite = 1;
    expect(
      (await post('confirm', { previewToken: p.body.previewToken })).status,
    ).toBe(500);
    expect(state()).toBe(before);
  });
  it.each([{ nodeIds: [] }, { expectedRevision: 5 }, { value: '0.00' }])(
    'no acepta selección ni valores del cliente %j',
    async (body) => {
      expect((await post('preview', body)).status).toBe(400);
      expect(
        (await post('confirm', { previewToken: 'fake', ...body })).status,
      ).toBe(400);
    },
  );
  it('UUID y token inválidos', async () => {
    expect((await post('preview', {}, 'invalid')).status).toBe(400);
    for (const previewToken of [null, 1, '', 'a'.repeat(4097)])
      expect((await post('confirm', { previewToken })).status).toBe(400);
  });
});

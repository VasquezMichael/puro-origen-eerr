import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Model } from 'mongoose';
import request from 'supertest';
import { ROOTS } from '@puro-origen/domain';
import { AuthGuard } from '../auth/auth.guard.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { SessionTokenService } from '../auth/session-token.service.js';
import { UsersService } from '../users/users.service.js';
import { BranchRole } from '../users/user-role.js';
import { BranchesService } from '../branches/branches.service.js';
import { EerrService } from './eerr.service.js';
import { EerrClock } from './eerr-clock.js';
import { StructureController } from './structure.controller.js';
import { StructureService } from './structure.service.js';
import { StructureRepository } from './structure.repository.js';
import {
  fixtureBranch,
  fixtureOtherBranch,
  fixtureUser,
  fixtureNow,
  MemoryStructureRepository,
} from '../../test/structure.fixture.js';
import type { EerrDocument } from './schemas/eerr.schema.js';

describe('EP-04A HTTP, guard y dominio reales, persistencia aislada', () => {
  let app: INestApplication;
  let store = new MemoryStructureRepository();
  let now: Date;
  let viewer: {
    id: string;
    active: boolean;
    isAdmin: boolean;
    branchAccesses: { branchId: string; role: BranchRole }[];
  };
  let id: string;
  const api = () => request(app.getHttpServer());
  const send = (path: string, body: object) =>
    api()
      .post(`/eerr/${id}/${path}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send(body);
  const read = (target = id) =>
    api()
      .get(`/eerr/${target}/structure`)
      .set('Cookie', `${SESSION_COOKIE}=offline`);
  const init = (expectedRevision = 0) =>
    send('structure/initialize', { expectedRevision });
  const createItem = async (name = 'Ventas') => {
    const current = (await read()).body;
    return send('items', {
      expectedRevision: current.revision,
      parentId: current.structure.nodes[0].nodeId,
      name,
    });
  };
  const amount = (
    nodeId: string,
    expectedRevision: number,
    state: string,
    input?: string,
  ) =>
    api()
      .put(`/eerr/${id}/items/${nodeId}/amount`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send({
        expectedRevision,
        state,
        ...(input === undefined ? {} : { input }),
      });
  const category = (name = 'Servicios') =>
    read().then((current) =>
      send('categories/preview', {
        expectedRevision: current.body.revision,
        operation: 'CREATE',
        parentCode: ROOTS[0].code,
        name,
      }),
    );
  const confirm = (previewId: string, expectedRevision: number) =>
    send('categories/confirm', { previewId, expectedRevision, confirm: true });
  beforeAll(async () => {
    const branches = {
      list: async (principal: {
        isAdmin: boolean;
        branchAccesses: { branchId: string }[];
      }) =>
        [fixtureBranch, fixtureOtherBranch, '111111111111111111111111']
          .filter(
            (branchId) =>
              principal.isAdmin ||
              principal.branchAccesses.some((a) => a.branchId === branchId),
          )
          .map((id) => ({ id, active: false })),
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
      controllers: [StructureController],
      providers: [
        StructureService,
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
        { provide: EerrClock, useValue: { now: () => new Date(now) } },
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
  afterAll(() => app?.close());
  beforeEach(() => {
    store = new MemoryStructureRepository();
    now = new Date(fixtureNow);
    id = store.seed()._id;
    viewer = {
      id: fixtureUser,
      active: true,
      isAdmin: true,
      branchAccesses: [],
    };
  });
  it('GET compatible con legado, sin escrituras y sin sesión rechazado', async () => {
    expect((await read()).body).toMatchObject({ revision: 0, structure: null });
    expect(store.writes).toBe(0);
    expect(store.state.templates).toEqual({});
    expect((await api().get(`/eerr/${id}/structure`)).status).toBe(401);
  });
  it('Editor puede publicar desde un EERR aún sin preparar sin inicializarlo', async () => {
    viewer = {
      ...viewer,
      isAdmin: false,
      branchAccesses: [{ branchId: fixtureBranch, role: BranchRole.EDITOR }],
    };
    const preview = await category();
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({ initialized: 0, uninitialized: 1 });
    expect(
      (await confirm(preview.body.previewId, 0)).body.structure,
    ).toBeNull();
    expect(store.writes).toBe(0);
    expect((await init()).body.structure.nodes[3].name).toBe('Servicios');
  });
  it('inicialización explícita conserva metadatos e idempotencia concurrente', async () => {
    const original = await store.get(id);
    const results = await Promise.all([init(), init()]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(results[0].body.structure.nodes).toHaveLength(3);
    expect(results[0].body.revision).toBe(1);
    expect(await store.get(id)).toMatchObject({
      _id: original!._id,
      createdAt: original!.createdAt,
      updatedAt: original!.updatedAt,
      createdBy: original!.createdBy,
      year: 2026,
      month: 9,
    });
    expect(store.writes).toBe(1);
    expect(store.state.rows).toHaveLength(1);
  });
  it('Lector consulta, no modifica; EERR ajeno e inexistente indistinguibles', async () => {
    viewer = {
      ...viewer,
      isAdmin: false,
      branchAccesses: [{ branchId: fixtureBranch, role: BranchRole.READER }],
    };
    expect((await read()).status).toBe(200);
    expect((await init()).status).toBe(403);
    const other = store.seed(fixtureOtherBranch);
    expect((await read(other._id)).status).toBe(404);
    expect((await read(randomUUID())).status).toBe(404);
  });
  it('Editor corrige histórico inactivo y crea ítem con identidades del servidor', async () => {
    viewer = {
      ...viewer,
      isAdmin: false,
      branchAccesses: [{ branchId: fixtureBranch, role: BranchRole.EDITOR }],
    };
    await init();
    const result = await createItem('  Véntas   salón  ');
    expect(result.status).toBe(201);
    const node = result.body.structure.nodes[3];
    expect(node.name).toBe('Véntas salón');
    expect(node.code).not.toBe(node.nodeId);
    expect(node.amount).toEqual({
      state: 'SIN_CARGAR',
      input: null,
      value: null,
      currency: 'ARS',
      scale: 2,
    });
    expect(store.state.concepts[0]._id).toBe(node.code);
  });
  it('importes exactos, cero, limpieza y progreso; no sobreescribe revisión antigua', async () => {
    await init();
    const row = (await createItem()).body;
    const node = row.structure.nodes[3];
    let result = await amount(node.nodeId, 2, 'CARGADO', '1,005');
    expect(result.status).toBe(200);
    expect(result.body.structure.nodes[3].amount).toMatchObject({
      input: '1,005',
      value: '1.01',
    });
    expect(result.body.progress.status).toBe('CARGADO');
    expect((await amount(node.nodeId, 2, 'CARGADO', '99')).status).toBe(409);
    expect((await read()).body.structure.nodes[3].amount.value).toBe('1.01');
    result = await amount(node.nodeId, 3, 'CARGADO', '0');
    expect(result.body.structure.nodes[3].amount.value).toBe('0.00');
    expect(result.body.progress.loaded).toBe(1);
    result = await amount(node.nodeId, 4, 'SIN_CARGAR');
    expect(result.body.structure.nodes[3].amount).toMatchObject({
      input: null,
      value: null,
      state: 'SIN_CARGAR',
    });
    expect(result.body.progress.loaded).toBe(0);
  });
  it('dos escrituras con misma revisión: una gana y otra recibe 409', async () => {
    await init();
    const node = (await createItem()).body.structure.nodes[3];
    const results = await Promise.all([
      amount(node.nodeId, 2, 'CARGADO', '10'),
      amount(node.nodeId, 2, 'CARGADO', '20'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await read()).body.revision).toBe(3);
  });
  it('rechaza padre ajeno, ITEM padre, hermanos duplicados, código cliente y campos extra', async () => {
    const row = (await init()).body;
    for (const extra of [
      { code: randomUUID() },
      { quantity: 3 },
      { nodeId: randomUUID() },
    ])
      expect(
        (
          await send('items', {
            expectedRevision: 1,
            parentId: row.structure.nodes[0].nodeId,
            name: 'A',
            ...extra,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await send('items', {
          expectedRevision: 1,
          parentId: randomUUID(),
          name: 'A',
        })
      ).status,
    ).toBe(400);
    const node = (await createItem()).body.structure.nodes[3];
    expect((await createItem(' VÉNTAS ')).status).toBe(400);
    expect(
      (
        await send('items', {
          expectedRevision: 2,
          parentId: node.nodeId,
          name: 'Hijo',
        })
      ).status,
    ).toBe(400);
    expect(
      (await amount(row.structure.nodes[0].nodeId, 2, 'CARGADO', '1')).status,
    ).toBe(400);
    expect((await amount(randomUUID(), 2, 'CARGADO', '1')).status).toBe(400);
  });
  it.each(['-1', '1e3', 'NaN', 'Infinity', '1+2', '999999999999.999'])(
    'rechaza importe %s sin escribir',
    async (value) => {
      await init();
      const node = (await createItem()).body.structure.nodes[3];
      expect((await amount(node.nodeId, 2, 'CARGADO', value)).status).toBe(400);
      expect((await read()).body.revision).toBe(2);
    },
  );
  it('valida UUID, revisiones estrictas y campos de importe', async () => {
    expect((await read('invalid')).status).toBe(400);
    for (const expectedRevision of [-1, 1.5, '0', null])
      expect(
        (await send('structure/initialize', { expectedRevision })).status,
      ).toBe(400);
    expect(
      (
        await send('structure/initialize', {
          expectedRevision: 0,
          structure: [],
        })
      ).status,
    ).toBe(400);
    await init();
    const node = (await createItem()).body.structure.nodes[3];
    expect((await amount(node.nodeId, 2, 'SIN_CARGAR', '1')).status).toBe(400);
    expect(
      (
        await api()
          .put(`/eerr/${id}/items/${node.nodeId}/amount`)
          .set('Cookie', `${SESSION_COOKIE}=offline`)
          .send({
            expectedRevision: 2,
            state: 'CARGADO',
            input: '1',
            value: '999',
          })
      ).status,
    ).toBe(400);
  });
  it('renombrar ítem conserva identidades, importe y mes histórico', async () => {
    await init();
    const node = (await createItem()).body.structure.nodes[3];
    await amount(node.nodeId, 2, 'CARGADO', '5.2');
    const result = await api()
      .patch(`/eerr/${id}/items/${node.nodeId}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send({ expectedRevision: 3, name: 'Venta salón' });
    expect(result.body.structure.nodes[3]).toMatchObject({
      nodeId: node.nodeId,
      code: node.code,
      name: 'Venta salón',
      amount: { value: '5.20' },
    });
  });
  it('global: Editor publica con conteos sin datos ajenos; otros meses intactos y legado recibe al inicializar', async () => {
    const other = store.seed(fixtureOtherBranch);
    const pending = store.seed('111111111111111111111111');
    const august = store.seed(fixtureBranch, 8);
    const nextYear = store.seed(fixtureBranch, 9, 2027);
    await init();
    const originalId = id;
    id = other._id;
    await init();
    const item = (await createItem('Nombre confidencial')).body.structure
      .nodes[3];
    await amount(item.nodeId, 2, 'CARGADO', '765.43');
    id = originalId;
    viewer = {
      ...viewer,
      isAdmin: false,
      branchAccesses: [{ branchId: fixtureBranch, role: BranchRole.EDITOR }],
    };
    const before = await store.get(other._id);
    const preview = await category();
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({
      affected: 3,
      initialized: 2,
      uninitialized: 1,
    });
    expect(JSON.stringify(preview.body)).not.toContain('confidencial');
    expect(JSON.stringify(preview.body)).not.toContain('765');
    expect(JSON.stringify(preview.body)).not.toContain(fixtureOtherBranch);
    const result = await confirm(preview.body.previewId, 1);
    expect(result.status).toBe(201);
    const updated = await store.get(other._id);
    expect(updated!.structure!.nodes[3]).toEqual(before!.structure!.nodes[3]);
    expect((await store.get(august._id))!.structure).toBeUndefined();
    expect((await store.get(nextYear._id))!.structure).toBeUndefined();
    expect((await store.get(pending._id))!.structure).toBeUndefined();
    const code = result.body.structure.nodes[3].code;
    viewer.isAdmin = true;
    id = pending._id;
    const prepared = await init();
    expect(prepared.body.structure.nodes[3].code).toBe(code);
  });
  it('renombrar categoría global conserva código, nodeId y subcategorías sin tocar otro mes', async () => {
    await init();
    const preview = await category();
    const created = await confirm(preview.body.previewId, 1);
    const node = created.body.structure.nodes[3];
    const child = await send('categories/preview', {
      expectedRevision: 2,
      operation: 'CREATE',
      parentCode: node.code,
      name: 'Subcategoría',
    });
    await confirm(child.body.previewId, 2);
    const rename = await send('categories/preview', {
      expectedRevision: 3,
      operation: 'RENAME',
      code: node.code,
      name: 'Servicios nuevos',
    });
    const result = await confirm(rename.body.previewId, 3);
    expect(result.body.structure.nodes[3]).toMatchObject({
      code: node.code,
      nodeId: node.nodeId,
      name: 'Servicios nuevos',
    });
    expect(result.body.structure.nodes[4].parentId).toBe(node.nodeId);
  });
  it('preview vencida, usuario diferente, revisión desactualizada y doble confirmación se rechazan', async () => {
    await init();
    let preview = (await category()).body;
    viewer.id = '333333333333333333333333';
    expect((await confirm(preview.previewId, 1)).status).toBe(409);
    viewer.id = fixtureUser;
    now = new Date(fixtureNow.getTime() + 300_000);
    expect((await confirm(preview.previewId, 1)).status).toBe(409);
    preview = (await category()).body;
    await createItem();
    expect((await confirm(preview.previewId, 2)).status).toBe(409);
    preview = (await category()).body;
    expect((await confirm(preview.previewId, 2)).status).toBe(201);
    expect((await confirm(preview.previewId, 3)).status).toBe(409);
  });
  it('cambio en EERR ajeno invalida preview sin sobrescribirlo', async () => {
    const other = store.seed(fixtureOtherBranch);
    await init();
    const own = id;
    id = other._id;
    await init();
    id = own;
    const preview = (await category()).body;
    id = other._id;
    await createItem();
    id = own;
    expect((await confirm(preview.previewId, 1)).status).toBe(409);
    expect((await read()).body.revision).toBe(1);
  });
  it('fallo entre escrituras aborta plantilla, catálogo, snapshots y consumo de preview', async () => {
    const other = store.seed(fixtureOtherBranch);
    await init();
    const own = id;
    id = other._id;
    await init();
    id = own;
    const preview = (await category()).body;
    const before = JSON.stringify(store.state);
    store.failWrite = store.writes + 2;
    const result = await confirm(preview.previewId, 1);
    expect(result.status).toBe(500);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('bloques no renombrables y conflictos locales de publicación no filtran nombres', async () => {
    await init();
    expect(
      (
        await send('categories/preview', {
          expectedRevision: 1,
          operation: 'RENAME',
          code: ROOTS[0].code,
          name: 'Otra',
        })
      ).status,
    ).toBe(400);
    await createItem('Servicios');
    const result = await category();
    expect(result.status).toBe(409);
    expect(result.body.message).not.toContain('Servicios');
  });
  it('Lector no crea ni renombra nodos, publica categorías o modifica importes', async () => {
    await init();
    const item = (await createItem()).body.structure.nodes[3];
    const preview = (await category()).body;
    viewer = {
      ...viewer,
      isAdmin: false,
      branchAccesses: [{ branchId: fixtureBranch, role: BranchRole.READER }],
    };
    expect((await createItem('Otro')).status).toBe(403);
    expect((await category()).status).toBe(403);
    expect((await confirm(preview.previewId, 2)).status).toBe(403);
    expect((await amount(item.nodeId, 2, 'CARGADO', '1')).status).toBe(403);
    expect(
      (
        await api()
          .patch(`/eerr/${id}/items/${item.nodeId}`)
          .set('Cookie', `${SESSION_COOKIE}=offline`)
          .send({ expectedRevision: 2, name: 'Otra' })
      ).status,
    ).toBe(403);
    expect((await read()).body.revision).toBe(2);
  });
});

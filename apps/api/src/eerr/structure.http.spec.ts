import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
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
  it.each(['-1', '1e3', 'NaN', 'Infinity', '1+', '999999999999.999'])(
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
    await put(`items/${item.nodeId}/quantity`, {
      expectedRevision: 3,
      state: 'CARGADO',
      input: '7',
    }).expect(200);
    await put(`items/${item.nodeId}/note`, {
      expectedRevision: 4,
      note: 'Nota local',
    }).expect(200);
    await put('note', {
      expectedRevision: 5,
      note: 'Nota general local',
    }).expect(200);
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
    expect(updated!.note).toBe(before!.note);
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
  const put = (path: string, body: object, target = id) =>
    api()
      .put(`/eerr/${target}/${path}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send(body);
  const prepareItem = async () => {
    await init();
    return (await createItem()).body.structure.nodes[3];
  };
  it('EP-04B1: recalcula la expresión y conserva únicamente espacios internos', async () => {
    const node = await prepareItem();
    const result = await amount(
      node.nodeId,
      2,
      'CARGADO',
      '  (1000 + 500) / 3  ',
    );
    expect(result.status).toBe(200);
    expect(result.body.structure.nodes[3].amount).toMatchObject({
      input: '(1000 + 500) / 3',
      value: '500.00',
    });
    await put(`items/${node.nodeId}/amount`, {
      expectedRevision: 3,
      state: 'CARGADO',
      input: '1+2',
      value: '99.00',
    }).expect(400);
    expect((await read()).body.revision).toBe(3);
  });
  it.each([
    '1/0',
    '(1',
    '1e4',
    'Math.random()',
    '1,000.00',
    '1'.repeat(257),
    '('.repeat(17) + '1' + ')'.repeat(17),
  ])('API rechaza expresión %s', async (input) => {
    const node = await prepareItem();
    await put(`items/${node.nodeId}/amount`, {
      expectedRevision: 2,
      state: 'CARGADO',
      input,
    }).expect(400);
    expect((await read()).body.revision).toBe(2);
  });
  it('cantidad independiente: entero, cero y sin cargar no cambian importe ni progreso', async () => {
    const node = await prepareItem();
    await amount(node.nodeId, 2, 'CARGADO', '12.30');
    const before = (await read()).body;
    for (const [revision, body, expected] of [
      [
        3,
        { state: 'CARGADO', input: '999999999999' },
        { state: 'CARGADO', value: '999999999999' },
      ],
      [4, { state: 'CARGADO', input: '0' }, { state: 'CARGADO', value: '0' }],
      [5, { state: 'SIN_CARGAR' }, { state: 'SIN_CARGAR', value: null }],
    ] as const) {
      const result = await put(`items/${node.nodeId}/quantity`, {
        expectedRevision: revision,
        ...body,
      }).expect(200);
      expect(result.body.structure.nodes[3].quantity).toEqual(expected);
      expect(result.body.structure.nodes[3].amount).toEqual(
        before.structure.nodes[3].amount,
      );
      expect(result.body.progress).toEqual(before.progress);
    }
  });
  it.each(['-1', '1.5', '1,5', '1e2', 'abc', '1000000000000', '', 12, null])(
    'API rechaza cantidad %j sin modificar',
    async (input) => {
      const node = await prepareItem();
      await put(`items/${node.nodeId}/quantity`, {
        expectedRevision: 2,
        state: 'CARGADO',
        input,
      }).expect(400);
      expect((await read()).body.revision).toBe(2);
    },
  );
  it.each(['item', 'period'])(
    'nota %s: crear, editar, preservar saltos y eliminar; solo su EERR',
    async (kind) => {
      const node = await prepareItem();
      const other = store.seed(fixtureOtherBranch);
      const before = JSON.stringify(await store.get(other._id));
      const path = kind === 'item' ? `items/${node.nodeId}/note` : 'note';
      for (const [revision, note, expected] of [
        [2, '  primera\n  segunda  ', 'primera\n  segunda'],
        [3, 'editada', 'editada'],
        [4, ' \n ', null],
      ] as const) {
        const result = await put(path, {
          expectedRevision: revision,
          note,
        }).expect(200);
        expect(
          kind === 'item'
            ? (result.body.structure.nodes[3].note ?? null)
            : result.body.note,
        ).toBe(expected);
      }
      expect(JSON.stringify(await store.get(other._id))).toBe(before);
      expect((await read()).body.progress.loaded).toBe(0);
    },
  );
  it.each([
    ['item', 1000],
    ['period', 4000],
  ] as const)('nota %s valida máximo y campos extra', async (kind, limit) => {
    const node = await prepareItem();
    const path = kind === 'item' ? `items/${node.nodeId}/note` : 'note';
    await put(path, {
      expectedRevision: 2,
      note: 'x'.repeat(limit + 1),
    }).expect(400);
    await put(path, { expectedRevision: 2, note: 'texto', extra: true }).expect(
      400,
    );
    await put(path, { expectedRevision: 2, note: null }).expect(400);
    await put(path, { expectedRevision: 2, note: 'x'.repeat(limit) }).expect(
      200,
    );
  });
  it('nota general no prepara estructura ni reemplaza timestamps originales', async () => {
    const before = await store.get(id);
    const result = await put('note', {
      expectedRevision: 0,
      note: 'General',
    }).expect(200);
    expect(result.body.structure).toBeNull();
    expect((await store.get(id))!.createdAt).toEqual(before!.createdAt);
    expect((await store.get(id))!.structure).toBeUndefined();
  });
  const edits = ['amount', 'quantity', 'item-note', 'period-note'] as const;
  const editRequest = (
    kind: (typeof edits)[number],
    nodeId: string,
    expectedRevision = 2,
  ) => ({
    path:
      kind === 'period-note'
        ? 'note'
        : `items/${nodeId}/${kind === 'item-note' ? 'note' : kind}`,
    body: {
      expectedRevision,
      ...(kind.endsWith('note')
        ? { note: 'Prueba' }
        : { state: 'CARGADO', input: '2' }),
    },
  });
  it.each(edits)(
    '%s: CAS obsoleto no sobrescribe valor ni filtra detalles',
    async (kind) => {
      const node = await prepareItem();
      const edit = editRequest(kind, node.nodeId);
      await put(edit.path, edit.body).expect(200);
      const before = JSON.stringify(await store.get(id));
      const response = await put(edit.path, edit.body).expect(409);
      expect(JSON.stringify(await store.get(id))).toBe(before);
      expect(JSON.stringify(response.body)).not.toMatch(
        /Mongo|findOneAndUpdate|stack/,
      );
    },
  );
  for (const role of ['admin', 'EDITOR', 'READER', 'unassigned'] as const) {
    it.each(edits)(
      `${role}: permiso en %s de histórico inactivo`,
      async (kind) => {
        const node = await prepareItem();
        viewer.isAdmin = role === 'admin';
        viewer.branchAccesses =
          role === 'unassigned'
            ? []
            : [
                {
                  branchId: fixtureBranch,
                  role:
                    role === 'READER' ? BranchRole.READER : BranchRole.EDITOR,
                },
              ];
        const edit = editRequest(kind, node.nodeId);
        await put(edit.path, edit.body).expect(
          role === 'admin' || role === 'EDITOR'
            ? 200
            : role === 'READER'
              ? 403
              : 404,
        );
      },
    );
  }
  it('GET legado preserva entrada ausente y no escribe cantidades o notas al renombrar', async () => {
    const node = await prepareItem();
    await amount(node.nodeId, 2, 'CARGADO', '7.20');
    const stored = store.state.rows[0];
    delete (stored.structure!.nodes[3].amount as { input?: string }).input;
    const before = JSON.stringify(store.state);
    const result = await read();
    expect(result.body.structure.nodes[3].amount).toMatchObject({
      input: null,
      value: '7.20',
    });
    expect(result.body.structure.nodes[3].quantity).toBeUndefined();
    expect(result.body.note).toBeNull();
    expect(JSON.stringify(store.state)).toBe(before);
    await api()
      .patch(`/eerr/${id}/items/${node.nodeId}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send({ expectedRevision: 3, name: 'Nueva' })
      .expect(200);
    expect(store.state.rows[0].structure!.nodes[3].quantity).toBeUndefined();
    expect(store.state.rows[0].structure!.nodes[3].note).toBeUndefined();
    expect(
      store.state.rows[0].structure!.nodes[3].amount!.value!.toString(),
    ).toBe('7.20');
  });
  it.each(edits)(
    '%s: rechaza UUID, revisión y campos adicionales',
    async (kind) => {
      const node = await prepareItem();
      const edit = editRequest(kind, node.nodeId);
      await put(edit.path, edit.body, 'invalid').expect(400);
      if (kind !== 'period-note')
        await put(edit.path.replace(node.nodeId, 'bad'), edit.body).expect(400);
      for (const revision of [-1, 1.5, '2', null])
        await put(edit.path, {
          ...edit.body,
          expectedRevision: revision,
        }).expect(400);
      await put(edit.path, { ...edit.body, extra: 1 }).expect(400);
    },
  );
  it('SIN_CARGAR de cantidad rechaza entrada; solo ítems admiten cantidad y nota', async () => {
    const node = await prepareItem();
    await put(`items/${node.nodeId}/quantity`, {
      expectedRevision: 2,
      state: 'SIN_CARGAR',
      input: '1',
    }).expect(400);
    const root = (await read()).body.structure.nodes[0].nodeId;
    await put(`items/${root}/quantity`, {
      expectedRevision: 2,
      state: 'CARGADO',
      input: '1',
    }).expect(400);
    await put(`items/${root}/note`, { expectedRevision: 2, note: 'X' }).expect(
      400,
    );
  });
  const archive = (
    nodeId: string,
    expectedRevision: number,
    restore = false,
    extra = {},
  ) =>
    api()
      .patch(`/eerr/${id}/items/${nodeId}/${restore ? 'restore' : 'archive'}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send({ expectedRevision, ...extra });
  const preparedItem = async () => {
    await init();
    const created = await createItem('Prueba recuperable');
    return created.body.structure.nodes.find(
      (n: { kind: string }) => n.kind === 'ITEM',
    );
  };
  it('archivo y restauración conservan identidad, valores, timestamps y otros EERR sin duplicar', async () => {
    const item = await preparedItem();
    await amount(item.nodeId, 2, 'CARGADO', '1000 + 500');
    const row = store.state.rows.find((r) => r._id === id)!;
    const saved = row.structure!.nodes.find((n) => n.nodeId === item.nodeId)!;
    saved.quantity = { state: 'CARGADO', value: '42' };
    saved.note = 'Nota conservada';
    const other = store.seed(fixtureOtherBranch);
    const before = JSON.stringify(row),
      otherBefore = JSON.stringify(other);
    const nodeBefore = JSON.stringify(saved);
    const result = await archive(item.nodeId, 3);
    expect(result.status).toBe(200);
    expect(result.body.revision).toBe(4);
    expect(result.body.progress).toMatchObject({
      total: 0,
      loaded: 0,
      pending: 0,
    });
    expect(
      result.body.structure.nodes.find(
        (n: { nodeId: string }) => n.nodeId === item.nodeId,
      ).archive,
    ).toEqual({ state: 'ARCHIVED', at: now.toISOString(), by: fixtureUser });
    const { archive: metadata, ...retained } = saved;
    expect(metadata!.state).toBe('ARCHIVED');
    expect(JSON.stringify(retained)).toBe(nodeBefore);
    expect(row.createdAt.toISOString()).toBe(JSON.parse(before).createdAt);
    expect(row.updatedAt.toISOString()).toBe(JSON.parse(before).updatedAt);
    const archivedBefore = JSON.stringify(row);
    await read();
    expect(JSON.stringify(row)).toBe(archivedBefore);
    const restored = await archive(item.nodeId, 4, true);
    expect(restored.status).toBe(200);
    expect(restored.body.revision).toBe(5);
    expect(restored.body.progress).toMatchObject({
      total: 1,
      loaded: 1,
      pending: 0,
    });
    expect(
      restored.body.structure.nodes.filter(
        (n: { nodeId: string }) => n.nodeId === item.nodeId,
      ),
    ).toHaveLength(1);
    expect(saved.archive).toEqual({ ...metadata, state: 'ACTIVE' });
    const { archive: _archive, ...restoredNode } = saved;
    expect(JSON.stringify(restoredNode)).toBe(nodeBefore);
    expect(JSON.stringify(other)).toBe(otherBefore);
    expect(row.updatedAt.toISOString()).toBe(JSON.parse(before).updatedAt);
  });
  it.each(['admin', 'editor', 'reader', 'unassigned'] as const)(
    '%s: permisos reales de archivo y restauración en sucursal inactiva',
    async (role) => {
      const item = await preparedItem();
      const assign = () => {
        viewer.isAdmin = role === 'admin';
        viewer.branchAccesses =
          role === 'unassigned' || role === 'admin'
            ? []
            : [
                {
                  branchId: fixtureBranch,
                  role:
                    role === 'editor' ? BranchRole.EDITOR : BranchRole.READER,
                },
              ];
      };
      assign();
      const expected =
        role === 'reader' ? 403 : role === 'unassigned' ? 404 : 200;
      expect((await archive(item.nodeId, 2)).status).toBe(expected);
      if (expected !== 200) {
        viewer.isAdmin = true;
        expect((await archive(item.nodeId, 2)).status).toBe(200);
      }
      assign();
      expect((await read()).status).toBe(role === 'unassigned' ? 404 : 200);
      expect((await archive(item.nodeId, 3, true)).status).toBe(expected);
    },
  );
  it('GET histórico interpreta activo sin migración ni timestamp nuevo', async () => {
    const item = await preparedItem();
    const before = JSON.stringify(store.state),
      writes = store.writes;
    const result = await read();
    expect(
      result.body.structure.nodes.find(
        (n: { nodeId: string }) => n.nodeId === item.nodeId,
      ),
    ).not.toHaveProperty('archive');
    expect(result.body.progress.total).toBe(1);
    expect(JSON.stringify(store.state)).toBe(before);
    expect(store.writes).toBe(writes);
  });
  it.each(['amount', 'quantity', 'note', 'rename'])(
    'archivado rechaza edición directa de %s',
    async (field) => {
      const item = await preparedItem();
      await archive(item.nodeId, 2);
      const before = JSON.stringify(store.state);
      const path = `/eerr/${id}/items/${item.nodeId}${field === 'rename' ? '' : `/${field}`}`;
      const req = field === 'rename' ? api().patch(path) : api().put(path);
      const body =
        field === 'note'
          ? { note: 'No' }
          : field === 'rename'
            ? { name: 'No' }
            : { state: 'CARGADO', input: '9' };
      expect(
        (
          await req
            .set('Cookie', `${SESSION_COOKIE}=offline`)
            .send({ expectedRevision: 3, ...body })
        ).status,
      ).toBe(400);
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it.each(['BLOCK', 'CATEGORY'])('no archiva ni restaura %s', async (kind) => {
    await init();
    if (kind === 'CATEGORY') {
      const p = await category();
      await confirm(p.body.previewId, 1);
    }
    const current = (await read()).body;
    const node = current.structure.nodes.find(
      (n: { kind: string }) => n.kind === kind,
    );
    for (const restore of [false, true])
      expect(
        (await archive(node.nodeId, current.revision, restore)).status,
      ).toBe(400);
  });
  it.each([false, true])(
    'valida UUID, revisión y campos adicionales (restore=%s)',
    async (restore) => {
      const item = await preparedItem();
      const before = JSON.stringify(store.state);
      expect((await archive('no-uuid', 2, restore)).status).toBe(400);
      expect((await archive(randomUUID(), 2, restore)).status).toBe(400);
      expect((await archive(item.nodeId, -1, restore)).status).toBe(400);
      expect((await archive(item.nodeId, 2.5, restore)).status).toBe(400);
      expect(
        (await archive(item.nodeId, 2, restore, { nodeId: item.nodeId }))
          .status,
      ).toBe(400);
      expect(
        (
          await api()
            .patch(
              `/eerr/${id}/items/${item.nodeId}/${restore ? 'restore' : 'archive'}`,
            )
            .set('Cookie', `${SESSION_COOKIE}=offline`)
            .send({})
        ).status,
      ).toBe(400);
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it('revisión obsoleta y transiciones repetidas no escriben', async () => {
    const item = await preparedItem();
    expect((await archive(item.nodeId, 1)).status).toBe(409);
    expect((await archive(item.nodeId, 2, true)).status).toBe(400);
    await archive(item.nodeId, 2);
    const before = JSON.stringify(store.state);
    expect((await archive(item.nodeId, 3)).status).toBe(400);
    expect((await archive(item.nodeId, 2, true)).status).toBe(409);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('padre inexistente devuelve error controlado sin restauración arbitraria', async () => {
    const item = await preparedItem();
    await archive(item.nodeId, 2);
    const row = store.state.rows.find((r) => r._id === id)!;
    row.structure!.nodes.find((n) => n.nodeId === item.nodeId)!.parentId =
      randomUUID();
    const before = JSON.stringify(row);
    const result = await archive(item.nodeId, 3, true);
    expect(result.status).toBe(400);
    expect(result.body.message).toContain('padre');
    expect(JSON.stringify(row)).toBe(before);
  });
  it.each(['archive', 'amount'])(
    'archivo concurrente contra %s: un ganador, revisión única y datos conservados',
    async (contender) => {
      const item = await preparedItem();
      const results = await Promise.all([
        archive(item.nodeId, 2),
        contender === 'archive'
          ? archive(item.nodeId, 2)
          : amount(item.nodeId, 2, 'CARGADO', '5+5'),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const result = (await read()).body;
      expect(result.revision).toBe(3);
      const saved = result.structure.nodes.find(
        (n: { nodeId: string }) => n.nodeId === item.nodeId,
      );
      expect(saved.code).toBe(item.code);
      if (results[0].status === 200) expect(saved.amount).toEqual(item.amount);
      else {
        expect(saved.amount.value).toBe('10.00');
        expect(saved.archive).toBeUndefined();
      }
    },
  );
  const moveItem = (
    nodeId: string,
    parentId: string,
    position: number,
    expectedRevision: number,
    extra = {},
  ) =>
    api()
      .patch(`/eerr/${id}/items/${nodeId}/move`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send({ parentId, position, expectedRevision, ...extra });
  async function movingItems() {
    await init();
    await createItem('Uno');
    const result = (await createItem('Dos')).body;
    return {
      root: result.structure.nodes[0],
      items: result.structure.nodes.filter(
        (n: { kind: string }) => n.kind === 'ITEM',
      ),
      revision: result.revision,
    };
  }
  it('mover ítem es local, preserva campos y no-op no escribe timestamps ni revisión', async () => {
    const other = store.seed(fixtureOtherBranch),
      old = store.seed(fixtureBranch, 8);
    const { root, items, revision } = await movingItems();
    await amount(items[1].nodeId, revision, 'CARGADO', '5+5');
    const before = (await read()).body,
      foreign = JSON.stringify([other, old]);
    const moved = await moveItem(
      items[1].nodeId,
      root.nodeId,
      0,
      before.revision,
    );
    expect(moved.status).toBe(200);
    expect(moved.body.revision).toBe(before.revision + 1);
    const original = before.structure.nodes.find(
      (n: { nodeId: string }) => n.nodeId === items[1].nodeId,
    );
    expect(
      moved.body.structure.nodes.find(
        (n: { nodeId: string }) => n.nodeId === items[1].nodeId,
      ),
    ).toEqual({ ...original, position: 0 });
    expect(JSON.stringify([other, old])).toBe(foreign);
    const state = JSON.stringify(store.state),
      writes = store.writes;
    expect(
      (await moveItem(items[1].nodeId, root.nodeId, 0, moved.body.revision))
        .status,
    ).toBe(200);
    expect(JSON.stringify(store.state)).toBe(state);
    expect(store.writes).toBe(writes);
    expect(
      (await moveItem(items[0].nodeId, root.nodeId, 1, moved.body.revision))
        .status,
    ).toBe(200);
    expect(JSON.stringify(store.state)).toBe(state);
    expect(store.writes).toBe(writes);
  });
  it.each(['EDITOR', 'READER', 'ALIEN', 'ADMIN'])(
    'permiso de movimiento %s sobre histórico inactivo',
    async (role) => {
      const { root, items, revision } = await movingItems();
      viewer.isAdmin = role === 'ADMIN';
      viewer.branchAccesses =
        role === 'ALIEN'
          ? []
          : [
              {
                branchId: fixtureBranch,
                role: role === 'READER' ? BranchRole.READER : BranchRole.EDITOR,
              },
            ];
      const result = await moveItem(items[1].nodeId, root.nodeId, 0, revision);
      expect(result.status).toBe(
        role === 'READER' ? 403 : role === 'ALIEN' ? 404 : 200,
      );
    },
  );
  it.each([
    'fraction',
    'negative',
    'string',
    'extra',
    'parent',
    'revision',
    'uuid',
  ])('DTO de movimiento rechaza %s sin escritura', async (kind) => {
    const { root, items, revision } = await movingItems(),
      before = JSON.stringify(store.state);
    const body: Record<string, unknown> = {
      parentId: root.nodeId,
      position: 0,
      expectedRevision: revision,
    };
    if (kind === 'fraction') body.position = 0.5;
    if (kind === 'negative') body.position = -1;
    if (kind === 'string') body.position = '0';
    if (kind === 'extra') body.amount = { value: '99.00' };
    if (kind === 'parent') body.parentId = 'bad';
    if (kind === 'revision') body.expectedRevision = null;
    const result = await api()
      .patch(
        `/eerr/${id}/items/${kind === 'uuid' ? 'bad' : items[1].nodeId}/move`,
      )
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send(body);
    expect(result.status).toBe(400);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it.each(['move', 'rename', 'archive'])(
    'CAS: movimiento concurrente contra %s tiene un ganador',
    async (contender) => {
      const { root, items, revision } = await movingItems();
      const results = await Promise.all([
        moveItem(items[1].nodeId, root.nodeId, 0, revision),
        contender === 'move'
          ? moveItem(items[0].nodeId, root.nodeId, 1, revision)
          : contender === 'archive'
            ? archive(items[1].nodeId, revision)
            : api()
                .patch(`/eerr/${id}/items/${items[1].nodeId}`)
                .set('Cookie', `${SESSION_COOKIE}=offline`)
                .send({ expectedRevision: revision, name: 'Renombrado' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await read()).body.revision).toBe(revision + 1);
    },
  );
  it('movimiento obsoleto no altera hermanos; archivado y cruce de bloque rechazados', async () => {
    const { root, items, revision } = await movingItems();
    const before = JSON.stringify(store.state);
    expect(
      (await moveItem(items[1].nodeId, root.nodeId, 0, revision - 1)).status,
    ).toBe(409);
    const otherRoot = (await read()).body.structure.nodes[1];
    expect(
      (await moveItem(items[1].nodeId, otherRoot.nodeId, 0, revision)).status,
    ).toBe(400);
    expect(JSON.stringify(store.state)).toBe(before);
    await archive(items[1].nodeId, revision);
    const archived = JSON.stringify(store.state);
    expect(
      (await moveItem(items[1].nodeId, root.nodeId, 0, revision + 1)).status,
    ).toBe(400);
    expect(JSON.stringify(store.state)).toBe(archived);
  });

  async function globalMoveFixture() {
    await init();
    const other = store.seed(fixtureOtherBranch);
    await api()
      .post(`/eerr/${other._id}/structure/initialize`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send({ expectedRevision: 0 });
    for (const name of ['Categoría A', 'Categoría B']) {
      const preview = await category(name);
      await confirm(preview.body.previewId, (await read()).body.revision);
    }
    const current = (await read()).body;
    return {
      other,
      categories: current.structure.nodes.filter(
        (n: { kind: string }) => n.kind === 'CATEGORY',
      ),
      root: current.structure.nodes[0],
    };
  }
  const movePreview = async (
    nodeId: string,
    parentId: string,
    position: number,
  ) =>
    send('categories/move/preview', {
      nodeId,
      parentId,
      position,
      expectedRevision: (await read()).body.revision,
    });
  const moveConfirm = async (previewId: string) =>
    send('categories/move/confirm', {
      previewId,
      confirm: true,
      expectedRevision: (await read()).body.revision,
    });
  it('categoría global: preview sin cambios, publicación atómica e histórico intacto', async () => {
    const { categories, root, other } = await globalMoveFixture();
    const historical = store.seed(fixtureBranch, 8);
    await send('items', {
      expectedRevision: (await read()).body.revision,
      parentId: categories[0].nodeId,
      name: 'Local',
    });
    const beforeRows = JSON.stringify(store.state.rows),
      beforeTemplate = JSON.stringify(store.state.templates);
    const preview = await movePreview(categories[1].nodeId, root.nodeId, 0);
    expect(preview.status).toBe(201);
    expect(preview.body.affected).toBe(2);
    expect(preview.body.accessibleEerrs).toContain(other._id);
    expect(JSON.stringify(store.state.rows)).toBe(beforeRows);
    expect(JSON.stringify(store.state.templates)).toBe(beforeTemplate);
    const published = await moveConfirm(preview.body.previewId);
    expect(published.status).toBe(201);
    for (const row of store.state.rows.filter((r) => r.month === 9))
      expect(
        row
          .structure!.nodes.filter((n) => n.kind === 'CATEGORY')
          .sort((a, b) => a.position - b.position)
          .map((n) => n.code),
      ).toEqual([categories[1].code, categories[0].code]);
    expect(historical.structure).toBeUndefined();
    expect(historical.revision).toBeUndefined();
    expect(
      published.body.structure.nodes.find(
        (n: { name: string }) => n.name === 'Local',
      ).parentId,
    ).toBe(categories[0].nodeId);
  });
  it('mover categoría global a otra y volver a raíz conserva las instancias de cada EERR', async () => {
    const { categories, root } = await globalMoveFixture();
    const before = store.state.rows.map((r) =>
      r.structure!.nodes.map((n) => [n.nodeId, n.code]),
    );
    const preview = await movePreview(
      categories[0].nodeId,
      categories[1].nodeId,
      0,
    );
    expect(preview.status).toBe(201);
    expect((await moveConfirm(preview.body.previewId)).status).toBe(201);
    const back = await movePreview(categories[0].nodeId, root.nodeId, 0);
    expect(back.status).toBe(201);
    expect((await moveConfirm(back.body.previewId)).status).toBe(201);
    expect(
      store.state.rows.map((r) =>
        r.structure!.nodes.map((n) => [n.nodeId, n.code]),
      ),
    ).toEqual(before);
    const fresh = store.seed('111111111111111111111111');
    expect(
      (
        await api()
          .post(`/eerr/${fresh._id}/structure/initialize`)
          .set('Cookie', `${SESSION_COOKIE}=offline`)
          .send({ expectedRevision: 0 })
      ).status,
    ).toBe(201);
  });
  it.each(['revision', 'rollback', 'missing'])(
    'movimiento global aborta todo por %s',
    async (cause) => {
      const { categories, root, other } = await globalMoveFixture();
      const preview = await movePreview(categories[1].nodeId, root.nodeId, 0);
      if (cause === 'revision')
        store.state.rows.find((r) => r._id === other._id)!.revision!++;
      if (cause === 'missing')
        store.state.rows.find((r) => r._id === other._id)!.structure!.nodes =
          store.state.rows
            .find((r) => r._id === other._id)!
            .structure!.nodes.filter((n) => n.code !== categories[0].code);
      const beforeRows = JSON.stringify(store.state.rows),
        beforeTemplate = JSON.stringify(store.state.templates);
      if (cause === 'rollback') store.failWrite = store.writes + 2;
      const result = await moveConfirm(preview.body.previewId);
      expect(result.status).toBe(cause === 'rollback' ? 500 : 409);
      expect(JSON.stringify(store.state.rows)).toBe(beforeRows);
      expect(JSON.stringify(store.state.templates)).toBe(beforeTemplate);
    },
  );
  it('Editor publica sin revelar EERR ajenos y Lector no genera preview', async () => {
    const { categories, root, other } = await globalMoveFixture();
    viewer.isAdmin = false;
    viewer.branchAccesses = [
      { branchId: fixtureBranch, role: BranchRole.EDITOR },
    ];
    const preview = await movePreview(categories[1].nodeId, root.nodeId, 0);
    expect(preview.status).toBe(201);
    expect(preview.body.accessibleEerrs).toEqual([id]);
    expect(JSON.stringify(preview.body)).not.toContain(other._id);
    expect((await moveConfirm(preview.body.previewId)).status).toBe(201);
    viewer.branchAccesses[0].role = BranchRole.READER;
    expect(
      (await movePreview(categories[0].nodeId, root.nodeId, 0)).status,
    ).toBe(403);
  });
  it('categoría en igual ubicación no modifica snapshots, plantilla ni timestamps', async () => {
    const { categories, root } = await globalMoveFixture();
    const preview = await movePreview(categories[0].nodeId, root.nodeId, 0);
    expect(preview.body.noOp).toBe(true);
    const before = JSON.stringify(store.state.rows),
      template = JSON.stringify(store.state.templates),
      writes = store.writes;
    expect((await moveConfirm(preview.body.previewId)).status).toBe(201);
    expect(JSON.stringify(store.state.rows)).toBe(before);
    expect(store.writes).toBe(writes);
    expect(JSON.stringify(store.state.templates)).toBe(template);
  });

  it('orden global conserva ítems locales intercalados distintos en cada EERR', async () => {
    const { categories, root } = await globalMoveFixture();
    for (const [index, row] of store.state.rows.entries()) {
      const localRoot = row.structure!.nodes.find((n) => n.code === root.code)!;
      const localA = row.structure!.nodes.find(
        (n) => n.code === categories[0].code,
      )!;
      const localB = row.structure!.nodes.find(
        (n) => n.code === categories[1].code,
      )!;
      localA.position = 0;
      localB.position = index + 2;
      for (let j = 0; j <= index; j++)
        row.structure!.nodes.push({
          nodeId: randomUUID(),
          code: randomUUID(),
          kind: 'ITEM',
          name: `Local ${j}`,
          parentId: localRoot.nodeId,
          position: j + 1,
          amount: {
            state: 'SIN_CARGAR',
            value: null,
            input: null,
            currency: 'ARS',
            scale: 2,
          },
        });
    }
    const original = store.state.rows.map((r) =>
      r.structure!.nodes.filter((n) => n.kind === 'ITEM'),
    );
    const preview = await movePreview(categories[1].nodeId, root.nodeId, 0);
    expect(preview.status).toBe(201);
    expect((await moveConfirm(preview.body.previewId)).status).toBe(201);
    for (const [index, row] of store.state.rows.entries()) {
      expect(row.structure!.nodes.filter((n) => n.kind === 'ITEM')).toEqual(
        original[index],
      );
      expect(
        row
          .structure!.nodes.filter((n) => n.kind === 'CATEGORY')
          .sort((a, b) => a.position - b.position)
          .map((n) => n.code),
      ).toEqual([categories[1].code, categories[0].code]);
    }
  });
  it.each([
    'self',
    'descendant',
    'block',
    'item',
    'missing',
    'position',
    'extra',
  ])('preview global inválido %s no escribe', async (cause) => {
    const { categories, root } = await globalMoveFixture();
    await send('items', {
      parentId: root.nodeId,
      name: 'Local',
      expectedRevision: (await read()).body.revision,
    });
    if (cause === 'descendant') {
      const nested = await movePreview(
        categories[1].nodeId,
        categories[0].nodeId,
        0,
      );
      expect((await moveConfirm(nested.body.previewId)).status).toBe(201);
    }
    const current = (await read()).body;
    const parentId =
      cause === 'self'
        ? categories[0].nodeId
        : cause === 'descendant'
          ? categories[1].nodeId
          : cause === 'block'
            ? current.structure.nodes[1].nodeId
            : cause === 'item'
              ? current.structure.nodes.find(
                  (n: { kind: string }) => n.kind === 'ITEM',
                ).nodeId
              : cause === 'missing'
                ? randomUUID()
                : root.nodeId;
    const before = JSON.stringify(store.state);
    const response = await send('categories/move/preview', {
      nodeId: categories[0].nodeId,
      parentId,
      position: cause === 'position' ? 999 : 0,
      expectedRevision: current.revision,
      ...(cause === 'extra' ? { code: randomUUID() } : {}),
    });
    expect(response.status).toBe(400);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('confirmaciones globales concurrentes no reutilizan la revisión del preview', async () => {
    const { categories, root } = await globalMoveFixture();
    const first = await movePreview(categories[1].nodeId, root.nodeId, 0),
      second = await movePreview(categories[0].nodeId, categories[1].nodeId, 0);
    const revision = (await read()).body.revision;
    const results = await Promise.all(
      [first, second].map((p) =>
        send('categories/move/confirm', {
          previewId: p.body.previewId,
          expectedRevision: revision,
          confirm: true,
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import { initialNodes, emptyAmount, IMPORT_LIMITS } from '@puro-origen/domain';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';
import { ImportToken } from './import-token.js';
import { readCsv, csvEscape } from './csv.js';
import { EerrClock } from '../eerr-clock.js';
import { EerrService } from '../eerr.service.js';
import { StructureRepository } from '../structure.repository.js';
import { storedStructure } from '../schemas/structure.schema.js';
import type { EerrDocument } from '../schemas/eerr.schema.js';
import { BranchesService } from '../../branches/branches.service.js';
import { BranchRole } from '../../users/user-role.js';
import { UsersService } from '../../users/users.service.js';
import { AuthGuard } from '../../auth/auth.guard.js';
import { SESSION_COOKIE } from '../../auth/auth.constants.js';
import { SessionTokenService } from '../../auth/session-token.service.js';
import {
  MemoryStructureRepository,
  fixtureBranch,
  fixtureOtherBranch,
  fixtureUser,
  fixtureNow,
} from '../../../test/structure.fixture.js';
describe('EP-04C2 HTTP real aislado', () => {
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
      controllers: [ImportController],
      providers: [
        ImportService,
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
    for (let i = 0; i < 3; i++)
      nodes.push({
        nodeId: randomUUID(),
        code: randomUUID(),
        kind: 'ITEM',
        name: 'Ítem ' + i,
        parentId: nodes[0].nodeId,
        position: i,
        amount:
          i === 0
            ? {
                ...emptyAmount(),
                state: 'CARGADO',
                input: '5+5',
                value: '10.00',
              }
            : emptyAmount(),
        quantity: { state: 'CARGADO', value: '0' },
        note: 'Nota que permanece',
        ...(i === 2
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
  const get = (format = 'csv') =>
    request(app.getHttpServer())
      .get(`/eerr/${row._id}/import/template?format=${format}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`);
  const post = (
    kind: string,
    buffer: Buffer,
    token?: string,
    name = 'carga.csv',
    extra?: { key: string; value: string },
  ) => {
    let r = request(app.getHttpServer())
      .post(`/eerr/${row._id}/import/${kind}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`);
    if (token !== undefined) r = r.field('previewToken', token);
    if (extra) r = r.field(extra.key, extra.value);
    return r.attach('file', buffer, {
      filename: name,
      contentType: name.endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv',
    });
  };
  const encode = (grid: string[][]) =>
    Buffer.from(
      '\uFEFF' + grid.map((r) => r.map(csvEscape).join(';')).join('\r\n'),
    );
  async function upload(amount = '25', quantity = '3') {
    const response = await get();
    expect(response.status).toBe(200);
    const grid = readCsv(Buffer.from(response.text));
    grid[1][5] = amount;
    grid[1][6] = quantity;
    return encode(grid);
  }
  it('descarga CSV autorizada, sin escritura, con metadata', async () => {
    const before = JSON.stringify(store.state),
      r = await get();
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toContain('attachment');
    const grid = readCsv(Buffer.from(r.text));
    expect(grid).toHaveLength(3);
    expect(grid[1][0]).toBe(row._id);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('descarga XLSX y reapertura mediante preview HTTP', async () => {
    const buffer = await app.get(ImportService).template(row._id, 'xlsx', {
      sub: viewer.id,
      isAdmin: true,
      branchAccesses: [],
    });
    const p = await post('preview', buffer, undefined, 'carga.xlsx');
    expect(p.status).toBe(201);
    expect(p.body.changedFields).toBe(0);
    expect(p.body.previewToken).toBeNull();
  });
  it('preview no escribe y confirmación aplica varios campos preservando notas, identidad y orden', async () => {
    const file = await upload(),
      before = JSON.stringify(store.state),
      p = await post('preview', file);
    expect(p.status).toBe(201);
    expect(p.body.changedFields).toBe(2);
    expect(p.body.rows[0].before.amount.value).toBe('10.00');
    expect(p.body.rows[0].after.amount.value).toBe('25.00');
    expect(JSON.stringify(store.state)).toBe(before);
    const r = await post('confirm', file, p.body.previewToken);
    expect(r.status).toBe(201);
    expect(r.body.result.revision).toBe(6);
    expect(r.body.changedFields).toBe(2);
    expect(r.body.result.note).toBe(row.note);
    const item = r.body.result.structure.nodes[3];
    expect(item).toMatchObject({
      nodeId: row.structure!.nodes[3].nodeId,
      code: row.structure!.nodes[3].code,
      name: 'Ítem 0',
      position: 0,
      note: 'Nota que permanece',
      amount: { value: '25.00' },
      quantity: { value: '3' },
    });
    expect(r.body.result.structure.initializedAt).toBe(
      fixtureNow.toISOString(),
    );
    expect(r.body.result.structure.structureVersion).toBe(4);
    expect(r.body.result.structure.nodes[4].amount.state).toBe('SIN_CARGAR');
  });
  it.each(['ADMIN', 'EDITOR', 'READER', 'ALIEN'])(
    'permisos %s e histórico inactivo',
    async (role) => {
      const file = await upload();
      viewer.isAdmin = role === 'ADMIN';
      viewer.branchAccesses =
        role === 'EDITOR' || role === 'READER'
          ? [
              {
                branchId: fixtureBranch,
                role: role === 'EDITOR' ? BranchRole.EDITOR : BranchRole.READER,
              },
            ]
          : [];
      const r = await get();
      expect(r.status).toBe(role === 'ALIEN' ? 404 : 200);
      const p = await post('preview', file);
      expect(p.status).toBe(
        role === 'ALIEN' ? 404 : role === 'READER' ? 403 : 201,
      );
      if (role === 'ADMIN' || role === 'EDITOR')
        expect((await post('confirm', file, p.body.previewToken)).status).toBe(
          201,
        );
    },
  );
  it('Lector no puede confirmar un preview previo', async () => {
    const file = await upload(),
      p = await post('preview', file);
    viewer.isAdmin = false;
    viewer.branchAccesses = [
      { branchId: fixtureBranch, role: BranchRole.READER },
    ];
    expect((await post('confirm', file, p.body.previewToken)).status).toBe(403);
  });
  it('sin sesión se rechaza antes de procesar archivo', async () => {
    expect(
      (
        await request(app.getHttpServer()).get(
          `/eerr/${row._id}/import/template?format=csv`,
        )
      ).status,
    ).toBe(401);
  });
  it('EERR sin inicializar no descarga ni importa', async () => {
    const file = await upload();
    row.structure = null;
    expect((await get()).status).toBe(400);
    expect((await post('preview', file)).status).toBe(400);
  });
  it('renombrar mantiene compatibilidad por código; valores actuales se muestran', async () => {
    const file = await upload();
    row.structure!.nodes[3].name = 'Nombre nuevo';
    row.structure!.structureVersion++;
    row.revision++;
    row.structure!.nodes[3].amount!.input = '10';
    const p = await post('preview', file);
    expect(p.status).toBe(201);
    expect(p.body.rows[0].name).toBe('Nombre nuevo');
    expect(p.body.rows[0].before.amount.input).toBe('10');
  });
  it.each(['move', 'archive', 'create'])(
    'estructura %s posterior a descarga rechazada',
    async (kind) => {
      const file = await upload();
      if (kind === 'move')
        row.structure!.nodes[3].parentId = row.structure!.nodes[1].nodeId;
      if (kind === 'archive')
        row.structure!.nodes[3].archive = {
          state: 'ARCHIVED',
          at: fixtureNow.toISOString(),
          by: fixtureUser,
        };
      if (kind === 'create')
        row.structure!.nodes.push({
          ...row.structure!.nodes[4],
          nodeId: randomUUID(),
          code: randomUUID(),
          name: 'Nuevo',
          position: 3,
        });
      const before = JSON.stringify(store.state);
      expect((await post('preview', file)).status).toBe(409);
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it.each([
    'unknown',
    'duplicate',
    'blank',
    'archived',
    'invalidAmount',
    'decimalQuantity',
  ])('error por fila %s bloquea toda confirmación', async (kind) => {
    const grid = readCsv(await upload());
    if (kind === 'unknown') grid[2][2] = randomUUID();
    if (kind === 'duplicate') grid[2][2] = grid[1][2];
    if (kind === 'blank') grid[2][2] = '';
    if (kind === 'archived') grid[2][2] = row.structure!.nodes[5].code;
    if (kind === 'invalidAmount') grid[2][5] = '1/0';
    if (kind === 'decimalQuantity') grid[2][6] = '1.5';
    const file = encode(grid),
      before = JSON.stringify(store.state),
      p = await post('preview', file);
    expect(p.status).toBe(201);
    expect(p.body.issues.length).toBeGreaterThan(0);
    expect(p.body.previewToken).toBeNull();
    expect(p.body.rows[0].changed).toHaveLength(2);
    expect((await post('confirm', file, 'inventado')).status).toBe(409);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('solo cambia campo explícito y SIN_CARGAR limpia expresión', async () => {
    const file = await upload(' sin_cargar ', ''),
      p = await post('preview', file),
      r = await post('confirm', file, p.body.previewToken);
    expect(r.body.result.structure.nodes[3].amount).toMatchObject({
      state: 'SIN_CARGAR',
      input: null,
      value: null,
    });
    expect(r.body.result.structure.nodes[3].quantity.value).toBe('0');
  });
  it('vacío y valores idénticos son no-op sin token ni escritura', async () => {
    const file = await upload('5+5', '0'),
      before = JSON.stringify(store.state),
      p = await post('preview', file);
    expect(p.body.changedFields).toBe(0);
    expect(p.body.previewToken).toBeNull();
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it.each(['values', 'note', 'structure'])(
    'cambio %s tras preview devuelve 409 y no aplica ninguna fila',
    async (kind) => {
      const file = await upload(),
        p = await post('preview', file);
      row.revision++;
      if (kind === 'note') row.note = 'Nueva nota';
      if (kind === 'values') row.structure!.nodes[3].amount!.input = '10';
      if (kind === 'structure')
        row.structure!.nodes[3].parentId = row.structure!.nodes[1].nodeId;
      const before = JSON.stringify(store.state);
      expect((await post('confirm', file, p.body.previewToken)).status).toBe(
        409,
      );
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it('dos confirmaciones concurrentes y reintento solo escriben una vez', async () => {
    const file = await upload(),
      p = await post('preview', file);
    const results = await Promise.all([
      post('confirm', file, p.body.previewToken),
      post('confirm', file, p.body.previewToken),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const before = JSON.stringify(store.state);
    expect((await post('confirm', file, p.body.previewToken)).status).toBe(409);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('fallo de escritura revierte todo', async () => {
    const file = await upload(),
      p = await post('preview', file),
      before = JSON.stringify(store.state);
    store.failWrite = 1;
    expect((await post('confirm', file, p.body.previewToken)).status).toBe(500);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it.each(['file', 'actor', 'expired', 'signature'])(
    'preview vinculado a %s',
    async (kind) => {
      let file = await upload();
      const p = await post('preview', file);
      let token = p.body.previewToken;
      if (kind === 'file') file = await upload('26');
      if (kind === 'actor') viewer.id = '333333333333333333333333';
      if (kind === 'expired') now = new Date(now.getTime() + 300000);
      if (kind === 'signature') token += 'x';
      const before = JSON.stringify(store.state);
      expect((await post('confirm', file, token)).status).toBe(409);
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it('archivo de otro EERR y metadata inconsistente se rechazan', async () => {
    const grid = readCsv(await upload());
    grid.slice(1).forEach((r) => (r[0] = randomUUID()));
    expect((await post('preview', encode(grid))).status).toBe(400);
  });
  it('multipart estricto, campos adicionales y tamaño', async () => {
    const file = await upload();
    expect(
      (
        await post('preview', file, undefined, 'carga.csv', {
          key: 'nodes',
          value: '[]',
        })
      ).status,
    ).toBe(400);
    expect(
      (await post('preview', Buffer.alloc(IMPORT_LIMITS.fileBytes + 1))).status,
    ).toBe(413);
    expect((await get('xls')).status).toBe(400);
  });
});

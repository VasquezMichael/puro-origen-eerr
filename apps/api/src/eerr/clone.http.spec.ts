import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Types, type Model } from 'mongoose';
import {
  initialNodes,
  emptyAmount,
  cloneCategories,
} from '@puro-origen/domain';
import { CloneController } from './clone.controller.js';
import { CloneService } from './clone.service.js';
import { ClonePreviewToken } from './clone-preview-token.js';
import { EerrClock } from './eerr-clock.js';
import { EerrService } from './eerr.service.js';
import { StructureRepository } from './structure.repository.js';
import {
  storedStructure,
  publicStructure,
} from './schemas/structure.schema.js';
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
describe('EP-04C1 HTTP aislado con guard, token y dominio reales', () => {
  let app: INestApplication,
    store: MemoryStructureRepository = new MemoryStructureRepository(),
    source: ReturnType<MemoryStructureRepository['seed']>,
    destination: ReturnType<MemoryStructureRepository['seed']>,
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
        .map((id) => ({
          id,
          name: id === fixtureBranch ? 'Central' : 'Otra',
          active: false,
        })),
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
      controllers: [CloneController],
      providers: [
        CloneService,
        ClonePreviewToken,
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
    source = store.seed(fixtureBranch, 8);
    destination = store.seed(fixtureBranch, 9);
    const nodes = initialNodes([], randomUUID),
      category = {
        nodeId: randomUUID(),
        code: randomUUID(),
        name: 'Ventas',
        kind: 'CATEGORY' as const,
        parentId: nodes[0].nodeId,
        position: 0,
      };
    nodes.push(category);
    nodes.push({
      nodeId: randomUUID(),
      code: randomUUID(),
      name: 'Digitales',
      kind: 'ITEM',
      parentId: category.nodeId,
      position: 0,
      amount: {
        ...emptyAmount(),
        state: 'CARGADO',
        input: '5+5',
        value: '10.00',
      },
      quantity: { state: 'CARGADO', value: '0' },
      note: 'No copiar',
    });
    source.structure = storedStructure({
      schemaVersion: 1,
      structureVersion: 2,
      initializedAt: '2026-08-01T12:00:00Z',
      initializedBy: 'old',
      nodes,
    });
    source.revision = 3;
    source.note = 'Nota origen';
  });
  const send = (path: string, body: object, id = destination._id) =>
    request(app.getHttpServer())
      .post(`/eerr/${id}/clone/${path}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`)
      .send(body);
  const preview = (mode = 'ESTRUCTURA', sourceEerrId = source._id) =>
    send('preview', { sourceEerrId, mode });
  const confirm = (token: string, mode = 'ESTRUCTURA', extra = {}) =>
    send('confirm', {
      sourceEerrId: source._id,
      mode,
      previewToken: token,
      ...extra,
    });
  const sources = () =>
    request(app.getHttpServer())
      .get(`/eerr/${destination._id}/clone-sources`)
      .set('Cookie', `${SESSION_COOKIE}=offline`);
  it('listado prioriza misma sucursal, excluye vacío, futuro, inválido y destino sin escribir', async () => {
    const other = store.seed(fixtureOtherBranch, 9);
    other.structure = source.structure;
    const old = store.seed(fixtureBranch, 7);
    old.structure = source.structure;
    const future = store.seed(fixtureBranch, 10);
    future.structure = source.structure;
    const invalid = store.seed(fixtureOtherBranch, 7);
    invalid.structure = { ...source.structure!, nodes: [] };
    const before = JSON.stringify(store.state);
    const result = await sources();
    expect(result.status).toBe(200);
    expect(result.body.map((r: { id: string }) => r.id)).toEqual([
      source._id,
      old._id,
      other._id,
    ]);
    expect(result.body[0]).toMatchObject({
      branchName: 'Central',
      initialized: true,
      categories: 1,
      items: 1,
      loadedAmounts: 1,
      sameBranch: true,
      samePeriod: false,
    });
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('Lector lista solo sucursales consultables pero no clona', async () => {
    const hidden = store.seed(fixtureOtherBranch, 8);
    hidden.structure = source.structure;
    viewer.isAdmin = false;
    viewer.branchAccesses = [
      { branchId: fixtureBranch, role: BranchRole.READER },
    ];
    expect((await sources()).body.map((r: { id: string }) => r.id)).toEqual([
      source._id,
    ]);
    expect((await preview()).status).toBe(403);
  });
  it.each(['ESTRUCTURA', 'ESTRUCTURA_Y_VALORES'])(
    'preview %s no escribe y confirmar inicializa solo destino',
    async (mode) => {
      const before = JSON.stringify(store.state),
        original = JSON.stringify(source);
      const p = await preview(mode);
      expect(p.status).toBe(201);
      expect(p.body).toMatchObject({
        compatible: true,
        seedTemplate: true,
        counts: {
          categories: 1,
          items: 1,
          loadedAmounts: 1,
          zeroQuantities: 1,
        },
      });
      expect(JSON.stringify(store.state)).toBe(before);
      const result = await confirm(p.body.previewToken, mode);
      expect(result.status).toBe(201);
      expect(result.body.revision).toBe(1);
      expect(result.body.note).toBeNull();
      const item = result.body.structure.nodes.find(
        (n: { kind: string }) => n.kind === 'ITEM',
      );
      expect(item.code).toBe(source.structure!.nodes[4].code);
      expect(item.nodeId).not.toBe(source.structure!.nodes[4].nodeId);
      expect(item.note).toBeUndefined();
      expect(item.amount.value).toBe(mode === 'ESTRUCTURA' ? null : '10.00');
      expect(item.quantity.value).toBe(mode === 'ESTRUCTURA' ? null : '0');
      expect(
        JSON.stringify(store.state.rows.find((r) => r._id === source._id)),
      ).toBe(original);
      expect(store.state.templates['2026-9'].categories[0].code).toBe(
        source.structure!.nodes[3].code,
      );
      expect(
        store.state.rows.find((r) => r._id === destination._id)!.createdAt,
      ).toEqual(destination.createdAt);
    },
  );
  it('plantilla existente conserva nombre, incorpora extras y no modifica otros EERR', async () => {
    const categories = cloneCategories(
      publicStructure(source.structure)!.nodes,
    );
    categories[0].name = 'Nombre actual';
    categories.push({
      code: randomUUID(),
      parentCode: source.structure!.nodes[0].code,
      name: 'Extra',
      position: 1,
    });
    store.state.templates['2026-9'] = {
      _id: '2026-9',
      version: 4,
      gate: 2,
      categories,
    };
    const other = store.seed(fixtureOtherBranch, 9),
      before = JSON.stringify(other);
    const p = await preview();
    expect(p.body.seedTemplate).toBe(false);
    expect(p.body.destinationCategories).toBe(2);
    const r = await confirm(p.body.previewToken);
    expect(r.status).toBe(201);
    expect(
      r.body.structure.nodes.find(
        (n: { code: string }) => n.code === categories[0].code,
      ).name,
    ).toBe('Nombre actual');
    expect(store.state.templates['2026-9'].categories).toEqual(categories);
    expect(
      JSON.stringify(store.state.rows.find((r) => r._id === other._id)),
    ).toBe(before);
  });
  it.each(['structure', 'partial', 'note', 'revision', 'status'])(
    'destino %s no elegible',
    async (kind) => {
      if (kind === 'structure') destination.structure = source.structure;
      if (kind === 'partial') destination.structure = { nodes: [] } as never;
      if (kind === 'note') destination.note = 'nota';
      if (kind === 'revision') destination.revision = 1;
      if (kind === 'status') destination.loadStatus = 'CARGADO' as never;
      const before = JSON.stringify(store.state);
      expect((await preview()).status).toBe(409);
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it.each(['source', 'destination', 'template', 'archive'])(
    'cambio de %s después del preview produce 409 sin escritura',
    async (kind) => {
      const p = await preview();
      if (kind === 'source') source.revision++;
      if (kind === 'destination') destination.structure = source.structure;
      if (kind === 'template')
        store.state.templates['2026-9'] = {
          _id: '2026-9',
          version: 0,
          gate: 1,
          categories: [],
        };
      if (kind === 'archive') {
        source.structure!.nodes[4].archive = {
          state: 'ARCHIVED',
          at: fixtureNow.toISOString(),
          by: fixtureUser,
        };
        source.revision++;
      }
      const before = JSON.stringify(store.state);
      expect((await confirm(p.body.previewToken)).status).toBe(409);
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it('dos confirmaciones concurrentes y reintento: solo una inicialización', async () => {
    const p = await preview();
    const results = await Promise.all([
      confirm(p.body.previewToken),
      confirm(p.body.previewToken),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const before = JSON.stringify(store.state);
    expect((await confirm(p.body.previewToken)).status).toBe(409);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('fallo intermedio revierte plantilla y destino', async () => {
    const p = await preview(),
      before = JSON.stringify(store.state);
    store.failWrite = 1;
    expect((await confirm(p.body.previewToken)).status).toBe(500);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it.each(['missing', 'parent', 'expression'])(
    'incompatibilidad %s informada sin token ni escritura',
    async (kind) => {
      if (kind === 'expression')
        source.structure!.nodes[4].amount!.input = '9+9';
      else {
        const categories = cloneCategories(
          publicStructure(source.structure)!.nodes,
        );
        if (kind === 'missing') categories.length = 0;
        else categories[0].parentCode = source.structure!.nodes[1].code;
        store.state.templates['2026-9'] = {
          _id: '2026-9',
          version: 1,
          gate: 1,
          categories,
        };
      }
      const before = JSON.stringify(store.state),
        p = await preview();
      expect(p.status).toBe(201);
      expect(p.body.compatible).toBe(false);
      expect(p.body.issues.length).toBeGreaterThan(0);
      expect(p.body.previewToken).toBeNull();
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it.each(['ESTRUCTURA', 'ESTRUCTURA_Y_VALORES'])(
    'otra sucursal %s exige confirmación solo de valores',
    async (mode) => {
      source.branchId = new Types.ObjectId(fixtureOtherBranch);
      const p = await preview(mode);
      expect(p.body.crossBranchWarning !== null).toBe(
        mode === 'ESTRUCTURA_Y_VALORES',
      );
      if (mode === 'ESTRUCTURA_Y_VALORES') {
        const before = JSON.stringify(store.state);
        expect((await confirm(p.body.previewToken, mode)).status).toBe(400);
        expect(
          (
            await confirm(p.body.previewToken, mode, {
              confirmCrossBranchValues: false,
            })
          ).status,
        ).toBe(400);
        expect(JSON.stringify(store.state)).toBe(before);
      }
      expect(
        (
          await confirm(p.body.previewToken, mode, {
            confirmCrossBranchValues: true,
          })
        ).status,
      ).toBe(201);
    },
  );
  it.each(['EDITOR', 'READER', 'ALIEN'])(
    'permiso destino %s e histórico inactivo',
    async (role) => {
      viewer.isAdmin = false;
      viewer.branchAccesses =
        role === 'ALIEN'
          ? []
          : [
              {
                branchId: fixtureBranch,
                role: role === 'READER' ? BranchRole.READER : BranchRole.EDITOR,
              },
            ];
      const p = await preview();
      expect(p.status).toBe(
        role === 'ALIEN' ? 404 : role === 'READER' ? 403 : 201,
      );
      if (role === 'EDITOR')
        expect((await confirm(p.body.previewToken)).status).toBe(201);
    },
  );
  it('Editor destino y Lector origen inactivo del mismo período puede clonar', async () => {
    source.branchId = new Types.ObjectId(fixtureOtherBranch);
    source.month = destination.month;
    store.state.templates['2026-9'] = {
      _id: '2026-9',
      version: 2,
      gate: 0,
      categories: cloneCategories(publicStructure(source.structure)!.nodes),
    };
    viewer.isAdmin = false;
    viewer.branchAccesses = [
      { branchId: fixtureBranch, role: BranchRole.EDITOR },
      { branchId: fixtureOtherBranch, role: BranchRole.READER },
    ];
    const p = await preview('ESTRUCTURA_Y_VALORES');
    expect(p.status).toBe(201);
    expect(
      (
        await confirm(p.body.previewToken, 'ESTRUCTURA_Y_VALORES', {
          confirmCrossBranchValues: true,
        })
      ).status,
    ).toBe(201);
  });
  it('revocación de lectura origen impide confirmar aun conservando edición destino', async () => {
    source.branchId = new Types.ObjectId(fixtureOtherBranch);
    const p = await preview();
    viewer.isAdmin = false;
    viewer.branchAccesses = [
      { branchId: fixtureBranch, role: BranchRole.EDITOR },
    ];
    const before = JSON.stringify(store.state);
    expect((await confirm(p.body.previewToken)).status).toBe(409);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it.each([
    'partialSource',
    'invalidTemplateVersion',
    'missingTemplateWithInitializedPeer',
  ])(
    'persistencia inconsistente %s bloquea preview sin escritura',
    async (kind) => {
      if (kind === 'partialSource') source.structure = { nodes: [] } as never;
      if (kind === 'invalidTemplateVersion')
        store.state.templates['2026-9'] = {
          _id: '2026-9',
          version: -1,
          gate: 0,
          categories: cloneCategories(publicStructure(source.structure)!.nodes),
        };
      if (kind === 'missingTemplateWithInitializedPeer')
        store.seed(fixtureOtherBranch, 9).structure = source.structure;
      const before = JSON.stringify(store.state),
        p = await preview();
      expect(p.status).toBe(201);
      expect(p.body.compatible).toBe(false);
      expect(p.body.previewToken).toBeNull();
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it('eliminar origen después del preview invalida la confirmación sin escribir', async () => {
    const p = await preview();
    store.state.rows = store.state.rows.filter((row) => row._id !== source._id);
    const before = JSON.stringify(store.state);
    expect((await confirm(p.body.previewToken)).status).toBe(409);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it.each(['source', 'mode', 'actor', 'expired'])(
    'token no reutilizable para %s',
    async (kind) => {
      const p = await preview();
      let body = {
        sourceEerrId: source._id,
        mode: 'ESTRUCTURA',
        previewToken: p.body.previewToken,
      };
      if (kind === 'source') body.sourceEerrId = randomUUID();
      if (kind === 'mode') body.mode = 'ESTRUCTURA_Y_VALORES';
      if (kind === 'actor') viewer.id = '333333333333333333333333';
      if (kind === 'expired') now = new Date(now.getTime() + 300000);
      const before = JSON.stringify(store.state);
      expect((await send('confirm', body)).status).toBe(409);
      expect(JSON.stringify(store.state)).toBe(before);
    },
  );
  it.each([
    { sourceEerrId: 'bad', mode: 'ESTRUCTURA' },
    { sourceEerrId: randomUUID(), mode: 'OTHER' },
    { sourceEerrId: randomUUID(), mode: 'ESTRUCTURA', nodes: [] },
  ])('DTO estricto rechaza %j', async (body) => {
    expect((await send('preview', body)).status).toBe(400);
  });
  it('rechaza mismo EERR y período posterior', async () => {
    expect((await preview('ESTRUCTURA', destination._id)).status).toBe(400);
    source.month = 10;
    expect((await preview()).status).toBe(400);
  });
});

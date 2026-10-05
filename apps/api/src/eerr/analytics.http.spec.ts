import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ROOTS, type EerrStructure } from '@puro-origen/domain';
import { AuthGuard } from '../auth/auth.guard.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { SessionTokenService } from '../auth/session-token.service.js';
import { BranchesService } from '../branches/branches.service.js';
import { UsersService } from '../users/users.service.js';
import { BranchRole } from '../users/user-role.js';
import { Eerr } from './schemas/eerr.schema.js';
import { storedStructure } from './schemas/structure.schema.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

const b1 = '111111111111111111111111';
const b2 = '222222222222222222222222';
const b3 = '333333333333333333333333';
const b4 = '444444444444444444444444';
const actor = '555555555555555555555555';
type Branch = { id: string; name: string; active: boolean; startDate: Date };
type Row = {
  _id: string;
  branchId: string;
  year: number;
  month: number;
  revision: number;
  structure: ReturnType<typeof storedStructure> | null;
  loadStatus: string;
  salesGoal?: unknown;
};

function structure(
  income: string | null,
  costs: string | null,
  expenses: string | null,
): EerrStructure {
  const roots = ROOTS.map((root, index) => ({
    ...root,
    nodeId: randomUUID(),
    parentId: null,
    position: index,
    kind: 'BLOCK' as const,
  }));
  const items = [income, costs, expenses].map((value, index) => ({
    nodeId: randomUUID(),
    code: randomUUID(),
    parentId: roots[index]!.nodeId,
    position: 0,
    name: `Ítem ${index}`,
    kind: 'ITEM' as const,
    amount:
      value === null
        ? {
            state: 'SIN_CARGAR' as const,
            input: null,
            value: null,
            currency: 'ARS' as const,
            scale: 2 as const,
          }
        : {
            state: 'CARGADO' as const,
            input: null,
            value,
            currency: 'ARS' as const,
            scale: 2 as const,
          },
  }));
  return {
    schemaVersion: 1,
    structureVersion: 1,
    initializedAt: '2026-09-15T12:00:00Z',
    initializedBy: actor,
    nodes: [...roots, ...items],
  };
}

describe('EP-06A.1 HTTP: Dashboard agregado sin MongoDB ni AppModule', () => {
  let app: INestApplication;
  let branches: Branch[];
  let rows: Row[];
  let reads: number;
  let writes: number;
  let afterRead: (() => void) | null;
  let viewer: {
    _id: string;
    active: boolean;
    isAdmin: boolean;
    branchAccesses: { branchId: string; role: BranchRole }[];
  };
  const get = (query = '?year=2026&month=9') =>
    request(app.getHttpServer())
      .get(`/analytics/dashboard${query}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`);

  beforeAll(async () => {
    const model = {
      find: (filter: {
        year: number;
        month: number;
        branchId: { $in: string[] };
      }) => ({
        select: function () {
          return this;
        },
        lean: function () {
          return this;
        },
        exec: async () => {
          reads++;
          const result = rows
            .filter(
              (row) =>
                row.year === filter.year &&
                row.month === filter.month &&
                filter.branchId.$in.includes(row.branchId),
            )
            .map((row) => ({ ...row }));
          if (afterRead) afterRead();
          return result;
        },
      }),
      create: () => {
        writes++;
        throw new Error('GET intentó escribir');
      },
      updateOne: () => {
        writes++;
        throw new Error('GET intentó escribir');
      },
    };
    const branchService = {
      list: async (principal: {
        isAdmin: boolean;
        branchAccesses: { branchId: string }[];
      }) =>
        branches.filter(
          (branch) =>
            principal.isAdmin ||
            principal.branchAccesses.some(
              (access) => access.branchId === branch.id,
            ),
        ),
    };
    const users = {
      findActiveById: async () => (viewer.active ? viewer : null),
    };
    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        AnalyticsService,
        Reflector,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: getModelToken(Eerr.name), useValue: model },
        { provide: BranchesService, useValue: branchService },
        { provide: UsersService, useValue: users },
        {
          provide: SessionTokenService,
          useValue: { verify: async () => ({ sub: actor }) },
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
    branches = [
      {
        id: b1,
        name: 'Centro',
        active: true,
        startDate: new Date('2026-09-01T03:00:00Z'),
      },
      {
        id: b2,
        name: 'Norte',
        active: true,
        startDate: new Date('2026-09-01T03:00:00Z'),
      },
      {
        id: b3,
        name: 'Inactiva',
        active: false,
        startDate: new Date('2025-01-01T03:00:00Z'),
      },
      {
        id: b4,
        name: 'Futura',
        active: true,
        startDate: new Date('2026-10-01T03:00:00Z'),
      },
    ];
    rows = [
      {
        _id: randomUUID(),
        branchId: b1,
        year: 2026,
        month: 9,
        revision: 1,
        structure: storedStructure(structure('100.00', '40.00', '20.00')),
        loadStatus: 'CARGADO',
      },
      {
        _id: randomUUID(),
        branchId: b2,
        year: 2026,
        month: 9,
        revision: 2,
        structure: storedStructure(structure('50.00', '10.00', '5.00')),
        loadStatus: 'CARGADO',
      },
    ];
    viewer = { _id: actor, active: true, isAdmin: true, branchAccesses: [] };
    reads = 0;
    writes = 0;
    afterRead = null;
  });

  it('Administrador ve consolidado global, cobertura y bases exactas sin escrituras', async () => {
    const response = await get().expect(200);
    expect(response.body.scope).toMatchObject({
      type: 'GLOBAL',
      authorizedCount: 4,
      expectedCount: 2,
    });
    expect(response.body.coverage).toMatchObject({
      expected: 2,
      withEerr: 2,
      complete: 2,
      inactiveWithoutHistory: 1,
      excludedNotStarted: 1,
    });
    expect(response.body.consolidated).toMatchObject({
      definitive: true,
      includedCount: 2,
      income: { value: '150.00' },
      costs: { value: '50.00' },
      expenses: { value: '25.00' },
      grossMarginPercent: { value: '66.6667' },
      netResult: { value: '75.00' },
      breakEvenSales: { value: '37.50' },
      targetSales: null,
    });
    expect(response.body.consolidated.breakEvenAssumption).toContain(
      'mezcla observada',
    );
    expect(response.body.timezone).toBe('America/Argentina/Buenos_Aires');
    expect(response.body.sources).toHaveLength(4);
    expect(response.body.sourceSignature).toMatch(/^[a-f\d]{64}$/);
    expect(reads).toBe(2);
    expect(writes).toBe(0);
  });

  it('subtotal incluye solo completas; faltante, parcial, vacío y no inicializado explican exclusión', async () => {
    const mixed = structure('50.00', '10.00', '5.00');
    mixed.nodes.push({
      nodeId: randomUUID(),
      code: randomUUID(),
      parentId: mixed.nodes[1]!.nodeId,
      position: 1,
      name: 'Pendiente',
      kind: 'ITEM',
      amount: {
        state: 'SIN_CARGAR',
        input: null,
        value: null,
        currency: 'ARS',
        scale: 2,
      },
    });
    rows[1]!.structure = storedStructure(mixed);
    let body = (await get().expect(200)).body;
    expect(body.coverage).toMatchObject({
      expected: 2,
      partial: 1,
      complete: 1,
    });
    expect(body.consolidated).toMatchObject({
      definitive: false,
      includedCount: 1,
      income: { value: '100.00' },
      grossMargin: { value: null, reason: 'INCOMPLETE_SCOPE' },
      netResult: { value: null },
      breakEvenSales: { value: null },
      targetSales: null,
    });
    expect(body.consolidated.label).toBe(
      'Subtotal de 1 de 2 sucursales esperadas',
    );
    rows.pop();
    body = (await get().expect(200)).body;
    expect(body.coverage.withoutEerr).toBe(1);
    expect(
      body.branches.find(
        (branch: { branchId: string }) => branch.branchId === b2,
      ),
    ).toMatchObject({
      eerrId: null,
      revision: null,
      analysisStatus: 'NO_EERR',
      blocks: null,
    });
    rows.push({
      _id: randomUUID(),
      branchId: b2,
      year: 2026,
      month: 9,
      revision: 0,
      structure: null,
      loadStatus: 'SIN_CARGAR',
    });
    expect((await get().expect(200)).body.coverage.uninitialized).toBe(1);
    rows[1]!.structure = storedStructure({
      ...structure('50.00', '10.00', '5.00'),
      nodes: ROOTS.map((root, index) => ({
        ...root,
        nodeId: randomUUID(),
        parentId: null,
        position: index,
        kind: 'BLOCK' as const,
      })),
    });
    expect((await get().expect(200)).body.coverage.empty).toBe(1);
  });

  it('inactiva con histórico participa; inactiva sin él no cuenta como faltante', async () => {
    rows.push({
      _id: randomUUID(),
      branchId: b3,
      year: 2026,
      month: 9,
      revision: 1,
      structure: storedStructure(structure('10.00', '0.00', '0.00')),
      loadStatus: 'CARGADO',
    });
    const body = (await get().expect(200)).body;
    expect(body.coverage).toMatchObject({
      expected: 3,
      inactiveWithHistory: 1,
      inactiveWithoutHistory: 0,
    });
    expect(body.consolidated.income.value).toBe('160.00');
  });

  it('pendientes y documentos históricos sin revision ni estructura conservan null', async () => {
    rows[1]!.structure = storedStructure(structure(null, null, null));
    rows[1]!.loadStatus = 'SIN_CARGAR';
    expect((await get().expect(200)).body.coverage.pending).toBe(1);
    rows[1]!.structure = null;
    rows[1]!.revision = undefined as unknown as number;
    const body = (await get().expect(200)).body;
    expect(body.coverage.uninitialized).toBe(1);
    expect(
      body.sources.find(
        (source: { branchId: string }) => source.branchId === b2,
      ).revision,
    ).toBe(0);
    expect(body.consolidated.grossMargin.value).toBeNull();
  });

  it.each([BranchRole.EDITOR, BranchRole.READER])(
    '%s solo recibe sucursales asignadas, sin nombres, IDs ni cifras ajenas',
    async (role) => {
      viewer = {
        ...viewer,
        isAdmin: false,
        branchAccesses: [{ branchId: b1, role }],
      };
      const body = (await get().expect(200)).body;
      expect(body.scope).toMatchObject({
        type: 'ACCESSIBLE',
        authorizedCount: 1,
        expectedCount: 1,
      });
      expect(body.scope.label).toBe('Consolidado de mis sucursales accesibles');
      expect(body.consolidated.income.value).toBe('100.00');
      expect(body.branches).toHaveLength(1);
      expect(JSON.stringify(body)).not.toContain(b2);
      expect(JSON.stringify(body)).not.toContain('Norte');
      expect(JSON.stringify(body)).not.toContain('50.00');
    },
  );

  it('firma ordenada cambia con revisión y aparición de EERR ausente', async () => {
    const first = (await get().expect(200)).body.sourceSignature;
    expect(
      (await get('?month=9&year=2026').expect(200)).body.sourceSignature,
    ).toBe(first);
    branches.reverse();
    rows.reverse();
    expect((await get().expect(200)).body.sourceSignature).toBe(first);
    rows[0]!.revision++;
    const changed = (await get().expect(200)).body.sourceSignature;
    expect(changed).not.toBe(first);
    rows.pop();
    const absent = (await get().expect(200)).body.sourceSignature;
    expect(absent).not.toBe(changed);
    rows.push({
      _id: randomUUID(),
      branchId: b1,
      year: 2026,
      month: 9,
      revision: 0,
      structure: storedStructure(structure('100.00', '40.00', '20.00')),
      loadStatus: 'CARGADO',
    });
    expect((await get().expect(200)).body.sourceSignature).not.toBe(absent);
  });

  it('reintenta una revisión concurrente y rechaza cambios repetidos con error estable', async () => {
    afterRead = () => {
      if (reads === 1) rows[0]!.revision++;
    };
    const body = (await get().expect(200)).body;
    expect(reads).toBe(4);
    expect(
      body.sources.find(
        (source: { branchId: string }) => source.branchId === b1,
      ).revision,
    ).toBe(2);
    reads = 0;
    afterRead = () => {
      if (reads === 1 || reads === 3) rows[0]!.revision++;
    };
    const response = await get().expect(409);
    expect(response.body.code).toBe('ANALYTICS_SOURCES_CHANGED');
    expect(reads).toBe(4);
  });

  it('detecta cambios de membresía y usa únicamente el alcance revalidado', async () => {
    afterRead = () => {
      if (reads === 1)
        viewer = {
          ...viewer,
          isAdmin: false,
          branchAccesses: [{ branchId: b1, role: BranchRole.READER }],
        };
    };
    const body = (await get().expect(200)).body;
    expect(reads).toBe(4);
    expect(body.scope.type).toBe('ACCESSIBLE');
    expect(body.branches).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(b2);
  });

  it('fecha de inicio usa Buenos Aires y datos históricos inválidos fallan controladamente', async () => {
    branches[3]!.startDate = new Date('2026-10-01T01:00:00Z');
    expect((await get().expect(200)).body.coverage.expected).toBe(3);
    rows[0]!.structure = storedStructure(structure('100.00', '40.00', '20.00'));
    rows[0]!.structure!.nodes[0]!.code = 'código inválido';
    expect((await get().expect(500)).body.code).toBe('INVALID_PERSISTED_DATA');
  });

  it('metas locales no crean objetivo consolidado; suma grande es exacta', async () => {
    rows[0]!.salesGoal = { mode: 'NET_MARGIN_PERCENT', value: '50.0000' };
    rows[0]!.structure = storedStructure(
      structure('999999999999.99', '0.00', '0.00'),
    );
    rows[1]!.structure = storedStructure(
      structure('999999999999.99', '0.00', '0.00'),
    );
    const body = (await get().expect(200)).body;
    expect(body.consolidated.income.value).toBe('1999999999999.98');
    expect(body.consolidated.targetSales).toBeNull();
  });

  it.each([
    '?year=2026&month=0',
    '?year=2026&month=13',
    '?year=x&month=9',
    '?year=2026&month=9&extra=1',
    '?year=2026&year=2025&month=9',
    '?year=2026&month=9&month=10',
  ])('rechaza consulta inválida %s', async (query) => {
    await get(query).expect(400);
  });

  it('rechaza un alcance mayor al límite sin devolver un subtotal silencioso', async () => {
    branches = Array.from({ length: 201 }, (_, index) => ({
      id: index.toString(16).padStart(24, '0'),
      name: `Sucursal ${index}`,
      active: true,
      startDate: new Date('2026-09-01T03:00:00Z'),
    }));
    await get().expect(400);
    expect(reads).toBe(0);
  });
});

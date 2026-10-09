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

  const comparisonGet = (path: string) =>
    request(app.getHttpServer())
      .get(`/analytics/${path}`)
      .set('Cookie', `${SESSION_COOKIE}=offline`);
  const comparisonPeriods =
    'year=2026&month=9&referenceYear=2026&referenceMonth=8';

  it('compares periods with exact differences and percentage points', async () => {
    branches[0]!.startDate = new Date('2025-01-01T03:00:00Z');
    rows.push({
      ...rows[0]!,
      _id: randomUUID(),
      year: 2026,
      month: 8,
      revision: 3,
      structure: storedStructure(structure('50.00', '10.00', '5.00')),
    });
    const body = (
      await comparisonGet(
        `branches/${b1}/period-comparison?${comparisonPeriods}`,
      ).expect(200)
    ).body;
    expect(body.orientation).toBe('CURRENT_MINUS_REFERENCE');
    expect(body.current.branch).toMatchObject({
      revision: 1,
      status: 'COMPLETE',
    });
    expect(body.reference.branch).toMatchObject({
      revision: 3,
      status: 'COMPLETE',
    });
    expect(body.metrics.income).toMatchObject({
      absoluteDifference: '50.00',
      relativeVariation: '100.0000',
    });
    expect(body.metrics.grossMarginPercent).toMatchObject({
      percentagePointDifference: '-20.0000',
      relativeVariation: null,
    });
    expect(body.current.sourceSignature).not.toBe(
      body.reference.sourceSignature,
    );
    expect(reads).toBe(4);
    expect(writes).toBe(0);
  });

  it('requires explicit reference and supports prior December and manual reference', async () => {
    branches[0]!.startDate = new Date('2025-01-01T03:00:00Z');
    await comparisonGet(
      `branches/${b1}/period-comparison?year=2026&month=9`,
    ).expect(400);
    rows.push({ ...rows[0]!, _id: randomUUID(), year: 2025, month: 12 });
    const body = (
      await comparisonGet(
        `branches/${b1}/period-comparison?year=2026&month=1&referenceYear=2025&referenceMonth=12`,
      ).expect(200)
    ).body;
    expect(body.reference.period).toEqual({ year: 2025, month: 12 });
    expect(body.current.branch.status).toBe('NO_EERR');
    expect(body.metrics.income).toMatchObject({
      absoluteDifference: null,
      reason: 'CURRENT_NO_EERR',
    });
  });

  it('returns authorized ordered table including inactive history and absence', async () => {
    rows.push({ ...rows[0]!, _id: randomUUID(), branchId: b3 });
    const body = (await comparisonGet('branches?year=2026&month=9').expect(200))
      .body;
    expect(
      body.branches.map((branch: { branchId: string }) => branch.branchId),
    ).toEqual([b1, b2, b3, b4]);
    expect(body.branches[2]).toMatchObject({
      active: false,
      status: 'COMPLETE',
    });
    expect(body.branches[3]).toMatchObject({
      eerrId: null,
      status: 'EXCLUDED',
    });
    expect(body.sourceSignature).toMatch(/^[a-f\d]{64}$/);
    expect(reads).toBe(2);
    expect(writes).toBe(0);
  });

  it('reverses branch orientation and rejects identical or unauthorized ids', async () => {
    const path = (a: string, b: string) =>
      `branches/compare?year=2026&month=9&branchId=${a}&referenceBranchId=${b}`;
    const forward = (await comparisonGet(path(b1, b2)).expect(200)).body;
    const backward = (await comparisonGet(path(b2, b1)).expect(200)).body;
    expect(forward.metrics.income.absoluteDifference).toBe('50.00');
    expect(backward.metrics.income.absoluteDifference).toBe('-50.00');
    await comparisonGet(path(b1, b1)).expect(400);
    viewer = {
      ...viewer,
      isAdmin: false,
      branchAccesses: [{ branchId: b1, role: BranchRole.READER }],
    };
    const denied = await comparisonGet(path(b1, b2)).expect(404);
    expect(JSON.stringify(denied.body)).not.toContain('Norte');
    expect(JSON.stringify(denied.body)).not.toContain('50.00');
  });

  it.each([BranchRole.EDITOR, BranchRole.READER])(
    '%s sees only authorized scope',
    async (role) => {
      branches[0]!.startDate = new Date('2025-01-01T03:00:00Z');
      viewer = {
        ...viewer,
        isAdmin: false,
        branchAccesses: [{ branchId: b1, role }],
      };
      const table = (
        await comparisonGet('branches?year=2026&month=9').expect(200)
      ).body;
      expect(table.scope.type).toBe('ACCESSIBLE');
      expect(table.branches).toHaveLength(1);
      expect(JSON.stringify(table)).not.toContain(b2);
      rows.push({ ...rows[0]!, _id: randomUUID(), year: 2026, month: 8 });
      const consolidated = (
        await comparisonGet(`consolidated/compare?${comparisonPeriods}`).expect(
          200,
        )
      ).body;
      expect(consolidated.scope.type).toBe('ACCESSIBLE');
      expect(consolidated.metrics.income.absoluteDifference).toBe('0.00');
      expect(JSON.stringify(consolidated)).not.toContain(b2);
    },
  );

  it('blocks financial comparison on subtotal and reports population changes', async () => {
    branches[0]!.startDate = new Date('2025-01-01T03:00:00Z');
    branches[1]!.startDate = new Date('2025-01-01T03:00:00Z');
    rows.push({ ...rows[0]!, _id: randomUUID(), year: 2026, month: 8 });
    const body = (
      await comparisonGet(`consolidated/compare?${comparisonPeriods}`).expect(
        200,
      )
    ).body;
    expect(body.current.consolidated.definitive).toBe(true);
    expect(body.reference.consolidated.definitive).toBe(false);
    expect(body.metrics.income).toMatchObject({
      absoluteDifference: null,
      reason: 'REFERENCE_SUBTOTAL',
    });
    expect(body.population.changedExistence).toContain(b2);
    expect(writes).toBe(0);
  });

  it('rechecks both periods and returns stable 409 after second change', async () => {
    rows.push({ ...rows[0]!, _id: randomUUID(), year: 2026, month: 8 });
    afterRead = () => {
      if (reads === 2) rows[2]!.revision++;
    };
    const body = (
      await comparisonGet(`consolidated/compare?${comparisonPeriods}`).expect(
        200,
      )
    ).body;
    expect(
      body.reference.sources.find(
        (source: { branchId: string }) => source.branchId === b1,
      ).revision,
    ).toBe(2);
    expect(reads).toBe(8);
    reads = 0;
    afterRead = () => {
      if (reads === 2 || reads === 6) rows[2]!.revision++;
    };
    expect(
      (
        await comparisonGet(`consolidated/compare?${comparisonPeriods}`).expect(
          409,
        )
      ).body.code,
    ).toBe('ANALYTICS_SOURCES_CHANGED');
    expect(reads).toBe(8);
  });

  it.each([
    'branches?year=2026&month=9&extra=1',
    `branches/compare?year=2026&month=9&branchId=${b1}&referenceBranchId=${b2}&extra=1`,
    `branches/not-an-id/period-comparison?${comparisonPeriods}`,
    'consolidated/compare?year=2026&month=9&referenceYear=2026&referenceMonth=13',
  ])('validates strictly %s', async (path) => {
    await comparisonGet(path).expect(400);
  });

  it('keeps absent and partial sources null, never turns them into zero', async () => {
    branches[0]!.startDate = new Date('2025-01-01T03:00:00Z');
    const path = `branches/${b1}/period-comparison?${comparisonPeriods}`;
    expect(
      (await comparisonGet(path).expect(200)).body.metrics.income.reason,
    ).toBe('REFERENCE_NO_EERR');
    rows.push({
      ...rows[0]!,
      _id: randomUUID(),
      year: 2026,
      month: 8,
      structure: storedStructure(structure('100.00', null, '0.00')),
    });
    expect(
      (await comparisonGet(path).expect(200)).body.metrics.income,
    ).toMatchObject({
      current: '100.00',
      reference: null,
      reason: 'REFERENCE_PENDING',
    });
    const table = (
      await comparisonGet('branches?year=2026&month=8').expect(200)
    ).body;
    expect(table.branches[0]).toMatchObject({
      status: 'PENDING',
      metrics: { income: '100.00', costs: null },
    });
    rows[0]!.structure = storedStructure(structure(null, '40.00', '20.00'));
    expect(
      (await comparisonGet(path).expect(200)).body.metrics.income.reason,
    ).toBe('CURRENT_PENDING');
    rows[0]!.structure = storedStructure(structure('0.00', '0.00', '0.00'));
    rows[2]!.structure = storedStructure(structure('0.00', '0.00', '0.00'));
    expect(
      (await comparisonGet(path).expect(200)).body.metrics.income,
    ).toMatchObject({
      current: '0.00',
      reference: '0.00',
      absoluteDifference: '0.00',
      relativeVariation: null,
      reason: 'REFERENCE_NOT_POSITIVE',
    });
  });

  it('compares negative net result without favorability or invented variation', async () => {
    rows[0]!.structure = storedStructure(structure('50.00', '40.00', '20.00'));
    rows[1]!.structure = storedStructure(structure('50.00', '40.00', '30.00'));
    const body = (
      await comparisonGet(
        `branches/compare?year=2026&month=9&branchId=${b1}&referenceBranchId=${b2}`,
      ).expect(200)
    ).body;
    expect(body.metrics.netResult).toMatchObject({
      current: '-10.00',
      reference: '-20.00',
      absoluteDifference: '10.00',
      relativeVariation: null,
      reason: 'REFERENCE_NOT_POSITIVE',
    });
    expect(JSON.stringify(body)).not.toContain('favorable');
  });

  it('distinguishes empty and uninitialized reference documents', async () => {
    const path = `branches/compare?year=2026&month=9&branchId=${b1}&referenceBranchId=${b2}`;
    const empty = structure('50.00', '10.00', '5.00');
    empty.nodes = empty.nodes.slice(0, 3);
    rows[1]!.structure = storedStructure(empty);
    expect(
      (await comparisonGet(path).expect(200)).body.metrics.income,
    ).toMatchObject({ absoluteDifference: null, reason: 'REFERENCE_EMPTY' });
    rows[1]!.structure = null;
    expect(
      (await comparisonGet(path).expect(200)).body.metrics.income,
    ).toMatchObject({
      absoluteDifference: null,
      reason: 'REFERENCE_UNINITIALIZED',
    });
  });

  it('blocks a partially loaded reference without using its subtotal', async () => {
    const partial = structure('50.00', '10.00', '5.00');
    partial.nodes.push({
      nodeId: randomUUID(),
      code: randomUUID(),
      parentId: partial.nodes[0]!.nodeId,
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
    rows[1]!.structure = storedStructure(partial);
    const body = (
      await comparisonGet(
        `branches/compare?year=2026&month=9&branchId=${b1}&referenceBranchId=${b2}`,
      ).expect(200)
    ).body;
    expect(body.reference.status).toBe('PARTIAL');
    expect(body.metrics.income).toMatchObject({
      reference: null,
      absoluteDifference: null,
      reason: 'REFERENCE_PARTIAL',
    });
  });

  it('detects source revision and membership changes on both signatures', async () => {
    branches[0]!.startDate = new Date('2025-01-01T03:00:00Z');
    rows.push({ ...rows[0]!, _id: randomUUID(), year: 2026, month: 8 });
    const path = `branches/${b1}/period-comparison?${comparisonPeriods}`;
    const first = (await comparisonGet(path).expect(200)).body;
    rows[2]!.revision++;
    const revised = (await comparisonGet(path).expect(200)).body;
    expect(revised.current.sourceSignature).toBe(first.current.sourceSignature);
    expect(revised.reference.sourceSignature).not.toBe(
      first.reference.sourceSignature,
    );
    branches[0]!.startDate = new Date('2026-08-01T03:00:00Z');
    const population = (await comparisonGet(path).expect(200)).body;
    expect(population.reference.sourceSignature).not.toBe(
      revised.reference.sourceSignature,
    );
  });

  it('changes reference signature when an EERR appears and disappears', async () => {
    branches[0]!.startDate = new Date('2025-01-01T03:00:00Z');
    const path = `branches/${b1}/period-comparison?${comparisonPeriods}`;
    const absent = (await comparisonGet(path).expect(200)).body.reference
      .sourceSignature;
    const reference = { ...rows[0]!, _id: randomUUID(), year: 2026, month: 8 };
    rows.push(reference);
    const present = (await comparisonGet(path).expect(200)).body.reference
      .sourceSignature;
    expect(present).not.toBe(absent);
    rows.pop();
    expect(
      (await comparisonGet(path).expect(200)).body.reference.sourceSignature,
    ).toBe(absent);
  });

  it('marks invalid stored structure without exposing raw document', async () => {
    const broken = storedStructure(structure('100.00', '40.00', '20.00'));
    broken.nodes[0]!.code = 'invalid';
    rows[0]!.structure = broken;
    const body = (await comparisonGet('branches?year=2026&month=9').expect(200))
      .body;
    expect(body.branches[0]).toMatchObject({
      status: 'INVALID',
      reason: 'INVALID',
    });
    expect(body.branches[0].metrics.income).toBeNull();
    expect(JSON.stringify(body)).not.toContain('invalid');
    const consolidated = (
      await comparisonGet(`consolidated/compare?${comparisonPeriods}`).expect(
        200,
      )
    ).body;
    expect(consolidated.current.invalidSources).toContain(b1);
    expect(consolidated.metrics.income.absoluteDifference).toBeNull();
  });
});

import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { SessionTokenService } from '../auth/session-token.service.js';
import { BranchRole } from '../users/user-role.js';
import { EerrModule } from './eerr.module.js';
import { EerrClock } from './eerr-clock.js';
import { businessMonthAt, eerrCalendarIssue } from '@puro-origen/domain';

const branchId = '123456789012345678901234';
const otherId = 'abcdefabcdefabcdefabcdef';
const missingId = '111111111111111111111111';
const userId = '222222222222222222222222';
const branchModel = { find: vi.fn(), findById: vi.fn() };
const userModel = { findOne: vi.fn() };
const eerrModel = {
  find: vi.fn(),
  findOne: vi.fn(),
  exists: vi.fn(),
  create: vi.fn(),
};

@Global()
@Module({
  providers: [
    {
      provide: getConnectionToken(),
      useValue: {
        models: { Branch: branchModel, User: userModel, Eerr: eerrModel },
      },
    },
    { provide: ConfigService, useValue: { get: () => undefined } },
  ],
  exports: [getConnectionToken(), ConfigService],
})
class OfflineInfrastructure {}

type Row = {
  _id: string;
  branchId: string;
  year: number;
  month: number;
  loadStatus: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};
type Filter = {
  _id?: string;
  branchId?: string | { $in: string[] };
  year?: number;
  month?: number;
};
const matches = (row: Row, filter: Filter) =>
  (!filter._id || row._id === filter._id) &&
  (!filter.branchId ||
    (typeof filter.branchId === 'string'
      ? row.branchId === filter.branchId
      : filter.branchId.$in.includes(row.branchId))) &&
  (filter.year === undefined || row.year === filter.year) &&
  (filter.month === undefined || row.month === filter.month);

describe('EERR HTTP con módulos y autorización reales; persistencia en memoria', () => {
  let app: INestApplication;
  let now: Date;
  let rows: Row[];
  let branches: {
    id: string;
    name: string;
    code: string;
    active: boolean;
    startDate: Date;
    createdAt: Date;
    updatedAt: Date;
  }[];
  let viewer: {
    id: string;
    active: boolean;
    isAdmin: boolean;
    branchAccesses: { branchId: string; role: BranchRole }[];
  };
  const api = () => request(app.getHttpServer());
  const cookie = `${SESSION_COOKIE}=offline-test-session`;
  const create = (body: object = { branchId, year: 2026, month: 8 }) =>
    api().post('/eerr').set('Cookie', cookie).send(body);
  const get = (path: string) => api().get(path).set('Cookie', cookie);
  const seed = (id: string, year = 2026, month = 8) => {
    const row = {
      _id: randomUUID(),
      branchId: id,
      year,
      month,
      loadStatus: 'SIN_CARGAR',
      createdBy: userId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
    rows.push(row);
    return row;
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [OfflineInfrastructure, AuthModule, EerrModule],
    })
      .overrideProvider(SessionTokenService)
      .useValue({ verify: async () => ({ sub: userId }) })
      .overrideProvider(EerrClock)
      .useValue({ now: () => new Date(now) })
      .compile();
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
    await app?.close();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    now = new Date('2026-09-15T12:00:00Z');
    rows = [];
    branches = [branchId, otherId].map((id, index) => ({
      id,
      name: index ? 'Norte' : 'Centro',
      code: `SUC-${index}`,
      active: true,
      startDate: new Date('2025-01-15T12:00:00Z'),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }));
    viewer = { id: userId, active: true, isAdmin: true, branchAccesses: [] };
    userModel.findOne.mockReturnValue({ exec: async () => viewer });
    branchModel.findById.mockImplementation((id) => ({
      exec: async () => branches.find((branch) => branch.id === id) ?? null,
    }));
    branchModel.find.mockImplementation((filter) => ({
      sort: () => ({
        exec: async () =>
          branches.filter(
            (branch) => !filter._id || filter._id.$in.includes(branch.id),
          ),
      }),
    }));
    eerrModel.exists.mockImplementation(
      async (filter: Filter) =>
        rows.find((row) => matches(row, filter)) ?? null,
    );
    eerrModel.findOne.mockImplementation((filter: Filter) => ({
      exec: async () => rows.find((row) => matches(row, filter)) ?? null,
    }));
    eerrModel.find.mockImplementation((filter: Filter) => ({
      exec: async () => rows.filter((row) => matches(row, filter)),
      sort: (sort: { year: number; month: number }) => ({
        exec: async () =>
          rows
            .filter((row) => matches(row, filter))
            .sort(
              (a, b) =>
                sort.year * (a.year - b.year) ||
                sort.month * (a.month - b.month),
            ),
      }),
    }));
    eerrModel.create.mockImplementation(
      async (input: {
        branchId: string;
        year: number;
        month: number;
        createdBy: string;
      }) => {
        if (rows.some((row) => matches(row, input)))
          throw {
            code: 11000,
            keyPattern: { branchId: 1, year: -1, month: -1 },
            message: 'internal database detail',
          };
        return seed(input.branchId, input.year, input.month);
      },
    );
  });
  it('exige sesión y revalida los permisos desde el usuario', async () => {
    await api().get('/eerr').expect(401);
    await api()
      .post('/eerr')
      .send({ branchId, year: 2026, month: 8 })
      .expect(401);
    viewer.isAdmin = false;
    await create().expect(403);
    expect(eerrModel.create).not.toHaveBeenCalled();
  });
  it('administrador crea un contenedor con creador del principal, sin importes', async () => {
    const response = await create().expect(201);
    expect(response.body).toMatchObject({
      branchId,
      year: 2026,
      month: 8,
      createdBy: userId,
      loadStatus: 'SIN_CARGAR',
    });
    expect(response.body.id).toMatch(/^[\da-f-]{36}$/);
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'id',
        'branchId',
        'year',
        'month',
        'loadStatus',
        'createdBy',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(eerrModel.create).toHaveBeenCalledWith({
      branchId,
      year: 2026,
      month: 8,
      createdBy: userId,
    });
  });
  it('editor crea solo en la sucursal asignada y lector no crea', async () => {
    viewer.isAdmin = false;
    viewer.branchAccesses = [{ branchId, role: BranchRole.EDITOR }];
    await create().expect(201);
    for (const id of [otherId, missingId])
      await create({ branchId: id, year: 2026, month: 8 }).expect(403);
    viewer.branchAccesses[0].role = BranchRole.READER;
    await create({ branchId, year: 2026, month: 7 }).expect(403);
    expect(rows).toHaveLength(1);
  });
  it.each(['admin', BranchRole.EDITOR, BranchRole.READER])(
    'inactiva impide crear a %s pero conserva sus históricos',
    async (role) => {
      branches[0].active = false;
      viewer.isAdmin = role === 'admin';
      viewer.branchAccesses = [
        {
          branchId,
          role:
            role === BranchRole.READER ? BranchRole.READER : BranchRole.EDITOR,
        },
      ];
      const row = seed(branchId);
      await create({ branchId, year: 2026, month: 7 }).expect(
        role === BranchRole.READER ? 403 : 400,
      );
      expect(
        (await get(`/eerr?branchId=${branchId}`).expect(200)).body,
      ).toHaveLength(1);
      expect((await get(`/eerr/${row._id}`).expect(200)).body.id).toBe(row._id);
      expect(eerrModel.create).not.toHaveBeenCalled();
    },
  );
  it.each([0, 13, -1, 1.5, '8', null, true])(
    'rechaza mes de creación inválido %j',
    async (month) => {
      await create({ branchId, year: 2026, month }).expect(400);
      expect(eerrModel.create).not.toHaveBeenCalled();
    },
  );
  it.each([0, -1, 10000, 2026.5, '2026', null, true])(
    'rechaza año de creación inválido %j',
    async (year) => {
      await create({ branchId, year, month: 8 }).expect(400);
      expect(eerrModel.create).not.toHaveBeenCalled();
    },
  );
  it('rechaza futuro y anterior al inicio; admite los meses límite completos', async () => {
    await create({ branchId, year: 2026, month: 10 }).expect(400);
    await create({ branchId, year: 2027, month: 1 }).expect(400);
    await create({ branchId, year: 2024, month: 12 }).expect(400);
    await create({ branchId, year: 2025, month: 1 }).expect(201);
    await create({ branchId, year: 2026, month: 9 }).expect(201);
    expect(rows).toHaveLength(2);
  });
  it('rechaza sucursal inválida e inexistente para administrador', async () => {
    await create({ branchId: 'invalid', year: 2026, month: 8 }).expect(400);
    await create({ branchId: missingId, year: 2026, month: 8 }).expect(404);
  });
  it.each([
    ['2026-10-01T01:00:00Z', 9, 400],
    ['2026-10-01T02:59:59.999Z', 9, 400],
    ['2026-10-01T03:00:00Z', 10, 201],
  ] as const)(
    'API y dominio coinciden al cambiar de mes en %s',
    async (instant, month, status) => {
      now = new Date(instant);
      expect(businessMonthAt(now)).toEqual({ year: 2026, month });
      const input = { branchId, year: 2026, month: 10 };
      expect(eerrCalendarIssue(input, branches[0].startDate, now)).toBe(
        status === 400 ? 'FUTURE' : null,
      );
      const response = await create(input).expect(status);
      if (status === 400) {
        expect(response.body.message).toBe(
          'No se pueden crear períodos futuros',
        );
        expect(eerrModel.create).not.toHaveBeenCalled();
      } else {
        expect(response.body).toMatchObject({ year: 2026, month: 10 });
      }
    },
  );
  it.each([
    ['2026-10-01T01:00:00Z', 201],
    ['2026-10-01T03:00:00Z', 400],
  ] as const)(
    'el inicio %s se interpreta como mes del negocio',
    async (start, status) => {
      now = new Date('2026-11-01T12:00:00Z');
      branches[0].startDate = new Date(start);
      const input = { branchId, year: 2026, month: 9 };
      expect(eerrCalendarIssue(input, branches[0].startDate, now)).toBe(
        status === 400 ? 'BEFORE_START' : null,
      );
      await create(input).expect(status);
      await create({ branchId, year: 2026, month: 8 }).expect(400);
    },
  );
  it('rechaza duplicado previo sin intentar una segunda escritura', async () => {
    seed(branchId);
    const response = await create().expect(409);
    expect(response.body.message).toContain('Ya existe un EERR');
    expect(eerrModel.create).not.toHaveBeenCalled();
  });
  it('dos solicitudes con lectura previa vacía producen un éxito y un conflicto de índice controlado', async () => {
    eerrModel.exists.mockResolvedValue(null);
    const responses = await Promise.all([create(), create()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      responses.find((response) => response.status === 409)?.body.message,
    ).toBe('Ya existe un EERR para esa sucursal, año y mes');
    expect(rows).toHaveLength(1);
    expect(eerrModel.create).toHaveBeenCalledTimes(2);
  });
  it.each(['invalid', branchId, '00000000-0000-0000-0000-000000000000'])(
    'rechaza UUID inválido %s',
    async (id) => {
      await get(`/eerr/${id}`).expect(400);
      expect(eerrModel.findOne).not.toHaveBeenCalled();
    },
  );
  it.each([
    'id',
    '_id',
    'createdBy',
    'loadStatus',
    'amount',
    'active',
    'isAdmin',
  ])('rechaza campo adicional %s', async (field) => {
    await create({
      branchId,
      year: 2026,
      month: 8,
      [field]: 'no permitido',
    }).expect(400);
    expect(eerrModel.create).not.toHaveBeenCalled();
  });
  it.each([
    'year=2026&month=0',
    'year=no&month=8',
    'year=2026.5&month=8',
    'year=2026&month=1e1',
    'year=2026&month=8&month=9',
    'year=2026',
    'year=2026&month=8&extra=1',
  ])('valida query estricta %s', async (query) => {
    await get(`/eerr/context?${query}`).expect(400);
    expect(eerrModel.find).not.toHaveBeenCalled();
  });
  it('lista solo accesibles, ordena por año/mes y no revela sucursales ajenas por errores', async () => {
    seed(branchId, 2026, 2);
    seed(branchId, 2025, 12);
    seed(branchId, 2026, 8);
    const hidden = seed(otherId);
    viewer.isAdmin = false;
    viewer.branchAccesses = [{ branchId, role: BranchRole.READER }];
    for (const path of ['/eerr', `/eerr?branchId=${branchId}`]) {
      const response = await get(path).expect(200);
      expect(response.body.map((row: Row) => [row.year, row.month])).toEqual([
        [2026, 8],
        [2026, 2],
        [2025, 12],
      ]);
      expect(response.body.every((row: Row) => row.branchId === branchId)).toBe(
        true,
      );
    }
    const forbidden = await get(`/eerr?branchId=${otherId}`).expect(403);
    const absent = await get(`/eerr?branchId=${missingId}`).expect(403);
    expect(forbidden.body).toEqual(absent.body);
    expect((await get(`/eerr/${hidden._id}`).expect(404)).body).toEqual(
      (await get(`/eerr/${randomUUID()}`).expect(404)).body,
    );
    await get('/eerr?branchId=bad').expect(400);
    await get(`/eerr?branchId=${branchId}&extra=1`).expect(400);
  });
  it('contexto incluye todas las accesibles, distingue existencia y nunca crea registros al consultar', async () => {
    const row = seed(branchId);
    branches[1].active = false;
    const response = await get('/eerr/context?year=2026&month=8').expect(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        branch: expect.objectContaining({ id: branchId }),
        exists: true,
        eerr: expect.objectContaining({ id: row._id }),
      }),
      expect.objectContaining({
        branch: expect.objectContaining({ id: otherId, active: false }),
        exists: false,
        eerr: null,
      }),
    ]);
    viewer.isAdmin = false;
    viewer.branchAccesses = [{ branchId: otherId, role: BranchRole.READER }];
    expect(
      (await get('/eerr/context?year=2026&month=8').expect(200)).body,
    ).toHaveLength(1);
    viewer.branchAccesses = [];
    expect(
      (await get('/eerr/context?year=2026&month=8').expect(200)).body,
    ).toEqual([]);
    expect((await get('/eerr').expect(200)).body).toEqual([]);
    expect(eerrModel.create).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });
  it('no monta modificaciones, borrado ni transiciones de ciclo de vida', async () => {
    const row = seed(branchId);
    await api()
      .patch(`/eerr/${row._id}`)
      .set('Cookie', cookie)
      .send({ branchId: otherId })
      .expect(404);
    await api().delete(`/eerr/${row._id}`).set('Cookie', cookie).expect(404);
    await api()
      .post(`/eerr/${row._id}/close`)
      .set('Cookie', cookie)
      .expect(404);
    expect(rows[0]).toEqual(row);
  });
});

import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module.js';
import { SessionTokenService } from '../auth/session-token.service.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { UsersModule } from '../users/users.module.js';
import { BranchRole } from '../users/user-role.js';
import { BranchesModule } from './branches.module.js';

const id = '123456789012345678901234';
const otherId = 'abcdefabcdefabcdefabcdef';
const branch = {
  id,
  code: 'SUC-prueba',
  name: 'Centro',
  startDate: new Date(),
  active: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const branchModel = {
  find: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  countDocuments: vi.fn(),
};
const userModel = {
  findOne: vi.fn(),
  exists: vi.fn(),
  create: vi.fn(),
  findByIdAndUpdate: vi.fn(),
};
// forFeature recibe una conexión simulada: nunca se llama a forRoot ni a Atlas.
@Global()
@Module({
  providers: [
    {
      provide: getConnectionToken(),
      useValue: { models: { Branch: branchModel, User: userModel } },
    },
    { provide: ConfigService, useValue: { get: () => undefined } },
  ],
  exports: [getConnectionToken(), ConfigService],
})
class TestInfrastructureModule {}

describe('rutas y dependencias de sucursales con AuthGuard real', () => {
  let app: INestApplication;
  let currentUser: {
    id: string;
    isAdmin: boolean;
    active: boolean;
    branchAccesses: { branchId: string; role: BranchRole }[];
  };
  const api = () => request(app.getHttpServer());
  const cookie = `${SESSION_COOKIE}=test-session`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TestInfrastructureModule,
        UsersModule,
        AuthModule,
        BranchesModule,
      ],
    })
      .overrideProvider(SessionTokenService)
      .useValue({ verify: async () => ({ sub: id }) })
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
    currentUser = { id, isAdmin: true, active: true, branchAccesses: [] };
    userModel.findOne.mockReturnValue({ exec: async () => currentUser });
    branchModel.find.mockImplementation((filter) => ({
      sort: () => ({
        exec: async () =>
          !filter._id || filter._id.$in.includes(id) ? [branch] : [],
      }),
    }));
    branchModel.findById.mockImplementation((value) => ({
      exec: async () => (value === id ? branch : null),
    }));
    branchModel.create.mockImplementation(async (input) => ({
      ...branch,
      ...input,
    }));
    branchModel.findByIdAndUpdate.mockReturnValue({ exec: async () => branch });
    branchModel.countDocuments.mockReturnValue({ exec: async () => 1 });
    userModel.exists.mockResolvedValue(false);
    userModel.create.mockImplementation(async (input) => ({
      ...currentUser,
      ...input,
    }));
    userModel.findByIdAndUpdate.mockReturnValue({
      exec: async () => currentUser,
    });
  });

  it('rechaza sesiones ausentes y usuarios no disponibles', async () => {
    await api().get('/branches').expect(401);
    userModel.findOne.mockReturnValue({ exec: async () => null });
    await api().get('/branches').set('Cookie', cookie).expect(401);
  });
  it('permite a administrador crear, editar y cambiar estado y no monta DELETE', async () => {
    await api()
      .post('/branches')
      .set('Cookie', cookie)
      .send({ name: ' Centro ' })
      .expect(201);
    await api()
      .patch(`/branches/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'Norte' })
      .expect(200);
    await api()
      .patch(`/branches/${id}/status`)
      .set('Cookie', cookie)
      .send({ active: true })
      .expect(200);
    await api().delete(`/branches/${id}`).set('Cookie', cookie).expect(404);
  });
  it.each([BranchRole.READER, BranchRole.EDITOR])(
    'filtra para %s y conserva visibilidad histórica sin permitir escritura',
    async (role) => {
      currentUser = {
        ...currentUser,
        isAdmin: false,
        branchAccesses: [{ branchId: id, role }],
      };
      const response = await api()
        .get('/branches')
        .set('Cookie', cookie)
        .expect(200);
      expect(response.body).toEqual([
        expect.objectContaining({ id, active: false }),
      ]);
      await api().get(`/branches/${id}`).set('Cookie', cookie).expect(200);
      for (const path of [`/branches/${id}`, `/branches/${id}/status`])
        await api()
          .patch(path)
          .set('Cookie', cookie)
          .send({ active: true })
          .expect(403);
      await api()
        .post('/branches')
        .set('Cookie', cookie)
        .send({ name: 'No autorizado', isAdmin: true })
        .expect(403);
      currentUser.branchAccesses = [];
      const none = await api()
        .get('/branches')
        .set('Cookie', cookie)
        .expect(200);
      expect(none.body).toEqual([]);
      await api().get(`/branches/${id}`).set('Cookie', cookie).expect(403);
      await api().get(`/branches/${otherId}`).set('Cookie', cookie).expect(404);
    },
  );
  it.each(['bad', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz'])(
    'rechaza id inválido %s',
    async (value) => {
      await api().get(`/branches/${value}`).set('Cookie', cookie).expect(400);
      await api()
        .patch(`/branches/${value}`)
        .set('Cookie', cookie)
        .send({ name: 'Centro' })
        .expect(400);
      expect(branchModel.findById).not.toHaveBeenCalled();
    },
  );
  it.each([
    { name: '' },
    { name: '   ' },
    { name: null },
    { name: 'Centro', startDate: '2024-02-30' },
    { name: 'Centro', startDate: null },
    { name: 'Centro', code: 'OTRO' },
    { name: 'Centro', active: false },
  ])('rechaza cuerpo inválido %j', async (body) => {
    await api().post('/branches').set('Cookie', cookie).send(body).expect(400);
    expect(branchModel.create).not.toHaveBeenCalled();
  });
  it.each(['code', 'active', 'id', 'normalizedName'])(
    'no permite editar %s',
    async (field) => {
      await api()
        .patch(`/branches/${id}`)
        .set('Cookie', cookie)
        .send({ [field]: 'cambio' })
        .expect(400);
      expect(branchModel.findByIdAndUpdate).not.toHaveBeenCalled();
    },
  );
  it('rechaza estado no booleano y campos extra', async () => {
    await api()
      .patch(`/branches/${id}/status`)
      .set('Cookie', cookie)
      .send({ active: 'false' })
      .expect(400);
    await api()
      .patch(`/branches/${id}/status`)
      .set('Cookie', cookie)
      .send({ active: false, name: 'Otro' })
      .expect(400);
  });
  it('valida accesos al crear y reasignar usuarios, sin convertir roles en globales', async () => {
    const access = { branchId: id, role: BranchRole.EDITOR };
    await api()
      .patch(`/users/${id}/branch-accesses`)
      .set('Cookie', cookie)
      .send({ branchAccesses: [access] })
      .expect(200);
    expect(userModel.findByIdAndUpdate.mock.calls[0][1]).toEqual({
      $set: { branchAccesses: [access] },
    });
    await api()
      .post('/users')
      .set('Cookie', cookie)
      .send({
        name: 'Usuario de prueba',
        email: 'user@example.invalid',
        password: 'test-only-password',
        branchAccesses: [access],
      })
      .expect(201);
    expect(userModel.create.mock.calls[0][0]).toMatchObject({
      isAdmin: false,
      branchAccesses: [access],
    });
    for (const accesses of [
      [access, access],
      [{ ...access, branchId: 'bad' }],
      [{ ...access, role: 'ADMIN' }],
    ]) {
      await api()
        .patch(`/users/${id}/branch-accesses`)
        .set('Cookie', cookie)
        .send({ branchAccesses: accesses })
        .expect(400);
      await api()
        .post('/users')
        .set('Cookie', cookie)
        .send({
          name: 'Usuario',
          email: 'user@example.invalid',
          password: 'test-only-password',
          branchAccesses: accesses,
        })
        .expect(400);
    }
    branchModel.countDocuments.mockReturnValue({ exec: async () => 0 });
    await api()
      .patch(`/users/${id}/branch-accesses`)
      .set('Cookie', cookie)
      .send({ branchAccesses: [access] })
      .expect(400);
    currentUser.isAdmin = false;
    await api()
      .patch(`/users/${id}/branch-accesses`)
      .set('Cookie', cookie)
      .send({ branchAccesses: [] })
      .expect(403);
  });
});

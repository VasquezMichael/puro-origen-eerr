import { Controller, Get, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../auth/auth.controller.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { SESSION_COOKIE } from '../auth/auth.constants.js';
import { SessionTokenService } from '../auth/session-token.service.js';
import { BranchesService } from '../branches/branches.service.js';
import { PasswordService } from './password.service.js';
import { User } from './schemas/user.schema.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { BranchRole } from './user-role.js';

const adminId = '111111111111111111111111';
const secondAdminId = '222222222222222222222222';
const editorId = '333333333333333333333333';
const readerId = '444444444444444444444444';
const branchId = '555555555555555555555555';
type FakeUser = {
  id: string;
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  active: boolean;
  mustChangePassword: boolean;
  authVersion?: number;
  adminStatusGuardVersion?: number;
  branchAccesses: { branchId: string; role: BranchRole }[];
};
const users = new Map<string, FakeUser>();
const makeUser = (id: string, admin = false, role = BranchRole.EDITOR): FakeUser => ({
  id,
  _id: id,
  name: `Usuario ${id.slice(0, 2)}`,
  email: `${id.slice(0, 2)}@example.invalid`,
  passwordHash: 'hash:contraseña-vigente',
  isAdmin: admin,
  active: true,
  mustChangePassword: false,
  authVersion: 0,
  adminStatusGuardVersion: 0,
  branchAccesses: admin ? [] : [{ branchId, role }],
});
const matches = (user: FakeUser, filter: Record<string, unknown>) =>
  Object.entries(filter).every(([key, value]) => {
    if (key === '_id') return user.id === value;
    return user[key as keyof FakeUser] === value;
  });
const query = <T>(get: () => T) => ({
  select() { return this; },
  sort() { return this; },
  session() { return this; },
  exec: async () => get(),
});
const userModel = {
  findOne: vi.fn((filter: Record<string, unknown>) => query(() => {
    const user = [...users.values()].find((candidate) => matches(candidate, filter));
    return user ? structuredClone(user) : null;
  })),
  findById: vi.fn((id: string) => query(() => users.get(id) ?? null)),
  find: vi.fn(() => query(() => [...users.values()])),
  exists: vi.fn(async (filter: Record<string, unknown>) => [...users.values()].some((user) => matches(user, filter))),
  countDocuments: vi.fn((filter: Record<string, unknown>) => query(() => [...users.values()].filter((user) => matches(user, filter)).length)),
  updateOne: vi.fn(async (filter: Record<string, unknown>) => {
    const user = [...users.values()].find((candidate) => matches(candidate, filter));
    if (user) user.adminStatusGuardVersion = (user.adminStatusGuardVersion ?? 0) + 1;
    return { matchedCount: user ? 1 : 0 };
  }),
  findOneAndUpdate: vi.fn((filter: Record<string, unknown>, update: { $set?: Partial<FakeUser>; $inc?: { authVersion?: number } }) => query(() => {
    const user = [...users.values()].find((candidate) => matches(candidate, filter));
    if (!user) return null;
    Object.assign(user, update.$set);
    if (update.$inc?.authVersion) user.authVersion = (user.authVersion ?? 0) + update.$inc.authVersion;
    return user;
  })),
  findByIdAndUpdate: vi.fn((id: string, update: { $set?: Partial<FakeUser>; $inc?: { authVersion?: number } }) => query(() => {
    const user = users.get(id);
    if (!user) return null;
    Object.assign(user, update.$set);
    if (update.$inc?.authVersion) user.authVersion = (user.authVersion ?? 0) + update.$inc.authVersion;
    return user;
  })),
  create: vi.fn(async (input: Partial<FakeUser>) => {
    const user = { ...makeUser('666666666666666666666666'), ...input } as FakeUser;
    users.set(user.id, user);
    return user;
  }),
};
const transaction = vi.fn(async (operation: (session: object) => Promise<unknown>) => operation({}));
const passwords = {
  hash: vi.fn(async (value: string) => `hash:${value}`),
  verify: vi.fn(async (value: string, hash: string) => hash === `hash:${value}`),
};

// Rutas protegidas mínimas para ejercitar el guard global sin montar persistencia.
@Controller()
class BusinessProbeController {
  @Get('eerr') eerr() { return { ok: true }; }
  @Get('branches') branches() { return { ok: true }; }
  @Get('analytics/dashboard') analytics() { return { ok: true }; }
}

describe('seguridad de usuarios y sesiones por HTTP, sin MongoDB', () => {
  let app: INestApplication;
  let tokens: SessionTokenService;
  const api = () => request(app.getHttpServer());
  const cookie = async (id: string) => `${SESSION_COOKIE}=${await tokens.sign({ sub: id, authVersion: users.get(id)?.authVersion ?? 0 })}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, UsersController, BusinessProbeController],
      providers: [
        UsersService, AuthService, SessionTokenService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getConnectionToken(), useValue: { transaction } },
        { provide: BranchesService, useValue: { validateAccesses: async () => [] } },
        { provide: PasswordService, useValue: passwords },
        { provide: ConfigService, useValue: { getOrThrow: () => 'secreto-ficticio-para-pruebas-de-sesion-123456', get: () => 'test' } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    tokens = module.get(SessionTokenService);
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    users.clear();
    users.set(adminId, makeUser(adminId, true));
    users.set(secondAdminId, makeUser(secondAdminId, true));
    users.set(editorId, makeUser(editorId));
    users.set(readerId, makeUser(readerId, false, BranchRole.READER));
    vi.clearAllMocks();
  });

  it('solo Admin activa y desactiva, y reactivar conserva accesos, rol y credenciales', async () => {
    const original = structuredClone(users.get(editorId)!);
    const adminCookie = await cookie(adminId);
    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: false }).expect(200);
    expect(users.get(editorId)?.active).toBe(false);
    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: true }).expect(200);
    expect(users.get(editorId)).toEqual({ ...original, authVersion: original.authVersion! + 1 });
    for (const id of [editorId, readerId])
      await api().patch(`/users/${adminId}/status`).set('Cookie', await cookie(id)).send({ active: false }).expect(403);
  });

  it('desactivar invalida definitivamente la sesión aun tras reactivar; un login nuevo funciona', async () => {
    const login = await api().post('/auth/login').send({ email: users.get(editorId)!.email, password: 'contraseña-vigente' }).expect(200);
    const prior = login.headers['set-cookie'];
    expect(await tokens.verify(prior[0].split(';')[0].split('=')[1])).toMatchObject({ sub: editorId, authVersion: 0 });
    await api().get('/eerr').set('Cookie', prior).expect(200);

    const adminCookie = await cookie(adminId);
    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: false }).expect(200);
    expect(users.get(editorId)?.authVersion).toBe(1);
    await api().get('/eerr').set('Cookie', prior).expect(401);

    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: true }).expect(200);
    expect(users.get(editorId)?.authVersion).toBe(1);
    await api().get('/eerr').set('Cookie', prior).expect(401);

    const next = await api().post('/auth/login').send({ email: users.get(editorId)!.email, password: 'contraseña-vigente' }).expect(200);
    expect(await tokens.verify(next.headers['set-cookie'][0].split(';')[0].split('=')[1])).toMatchObject({ sub: editorId, authVersion: 1 });
    await api().get('/eerr').set('Cookie', next.headers['set-cookie']).expect(200);
  });

  it('PATCH idempotente no incrementa authVersion', async () => {
    const adminCookie = await cookie(adminId);
    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: true }).expect(200);
    expect(users.get(editorId)?.authVersion).toBe(0);
    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: false }).expect(200);
    expect(users.get(editorId)?.authVersion).toBe(1);
    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: false }).expect(200);
    expect(users.get(editorId)?.authVersion).toBe(1);
    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: true }).expect(200);
    expect(users.get(editorId)?.authVersion).toBe(1);
  });

  it('valida body, usuario inexistente, self-disable y último Admin', async () => {
    const adminCookie = await cookie(adminId);
    await api().patch(`/users/${editorId}/status`).set('Cookie', adminCookie).send({ active: 'false' }).expect(400);
    await api().patch('/users/aaaaaaaaaaaaaaaaaaaaaaaa/status').set('Cookie', adminCookie).send({ active: false }).expect(404);
    const self = await api().patch(`/users/${adminId}/status`).set('Cookie', adminCookie).send({ active: false }).expect(409);
    expect(self.body.code).toBe('USER_SELF_DEACTIVATION_NOT_ALLOWED');
    expect(users.get(adminId)).toMatchObject({ active: true, authVersion: 0 });
    await api().patch(`/users/${secondAdminId}/status`).set('Cookie', adminCookie).send({ active: false }).expect(200);
    expect(users.get(secondAdminId)).toMatchObject({ active: false, authVersion: 1 });
    const last = await api().patch(`/users/${adminId}/status`).set('Cookie', await cookie(adminId)).send({ active: false }).expect(409);
    expect(last.body.code).toBe('USER_SELF_DEACTIVATION_NOT_ALLOWED');
    // El único Admin no puede ser desactivado incluso por una sesión administrativa ajena.
    const service = app.get(UsersService);
    await expect(service.setStatus(adminId, false, secondAdminId)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LAST_ACTIVE_ADMIN' }) });
    expect(users.get(adminId)?.active).toBe(true);
  });

  it('self-disable reconoce el mismo ObjectId con distinta capitalización y nunca escribe', async () => {
    const hexId = 'abcdefabcdefabcdefabcdef';
    users.set(hexId, makeUser(hexId, true));
    const response = await api().patch(`/users/${hexId.toUpperCase()}/status`).set('Cookie', await cookie(hexId)).send({ active: false }).expect(409);
    expect(response.body.code).toBe('USER_SELF_DEACTIVATION_NOT_ALLOWED');
    expect(users.get(hexId)).toMatchObject({ active: true, authVersion: 0 });
    expect(transaction).not.toHaveBeenCalled();
    users.get(hexId)!.active = false;
    await expect(app.get(UsersService).setStatus(hexId.toUpperCase(), false, hexId)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'USER_SELF_DEACTIVATION_NOT_ALLOWED' }) });
    expect(users.get(hexId)?.authVersion).toBe(0);
  });

  it('reset invalida JWT anterior; nuevo login emite versión actual sin exponer hash', async () => {
    const oldCookie = await cookie(editorId);
    const response = await api().patch(`/users/${editorId}/password`).set('Cookie', await cookie(adminId)).send({ password: 'temporal-segura-123' }).expect(200);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(users.get(editorId)).toMatchObject({ authVersion: 1, mustChangePassword: true });
    await api().get('/auth/me').set('Cookie', oldCookie).expect(401);
    const login = await api().post('/auth/login').send({ email: users.get(editorId)!.email, password: 'temporal-segura-123' }).expect(200);
    expect(login.body.user).not.toHaveProperty('passwordHash');
    await api().get('/auth/me').set('Cookie', login.headers['set-cookie']).expect(200);
    await api().post('/auth/login').send({ email: users.get(editorId)!.email, password: 'contraseña-vigente' }).expect(401);
  });

  it('contraseña temporal permite solo me/password/logout; cambio propio renueva sesión', async () => {
    users.get(editorId)!.mustChangePassword = true;
    const oldCookie = await cookie(editorId);
    await api().get('/auth/me').set('Cookie', oldCookie).expect(200);
    await api().post('/auth/logout').set('Cookie', oldCookie).expect(204);
    const blocked = await api().get('/users').set('Cookie', oldCookie).expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    for (const path of ['/eerr', '/branches', '/analytics/dashboard']) {
      const response = await api().get(path).set('Cookie', oldCookie).expect(403);
      expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    const changed = await api().post('/auth/password').set('Cookie', oldCookie).send({ currentPassword: 'contraseña-vigente', newPassword: 'nueva-segura-123' }).expect(201);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect(changed.body.user).not.toHaveProperty('passwordHash');
    expect(users.get(editorId)?.authVersion).toBe(1);
    await api().get('/auth/me').set('Cookie', oldCookie).expect(401);
    await api().get('/auth/me').set('Cookie', changed.headers['set-cookie']).expect(200);
    for (const path of ['/eerr', '/branches', '/analytics/dashboard'])
      await api().get(path).set('Cookie', changed.headers['set-cookie']).expect(200);
    await api().get('/users').set('Cookie', changed.headers['set-cookie']).expect(403);
  });

  it('Admin con contraseña temporal tampoco puede administrar hasta cambiarla', async () => {
    users.get(adminId)!.mustChangePassword = true;
    const prior = await cookie(adminId);
    await api().get('/auth/me').set('Cookie', prior).expect(200);
    await api().post('/auth/logout').set('Cookie', prior).expect(204);
    const blocked = await api().get('/users').set('Cookie', prior).expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const changed = await api().post('/auth/password').set('Cookie', prior).send({ currentPassword: 'contraseña-vigente', newPassword: 'nueva-segura-123' }).expect(201);
    expect(changed.body.user.mustChangePassword).toBe(false);
    await api().get('/users').set('Cookie', changed.headers['set-cookie']).expect(200);
  });

  it('reset administrativo requireChange=false mantiene acceso sin cambio obligatorio e invalida token previo', async () => {
    const prior = await cookie(editorId);
    await api().patch(`/users/${editorId}/password`).set('Cookie', await cookie(adminId)).send({ password: 'temporal-segura-123', requireChange: false }).expect(200);
    expect(users.get(editorId)).toMatchObject({ passwordHash: 'hash:temporal-segura-123', mustChangePassword: false, authVersion: 1 });
    await api().get('/eerr').set('Cookie', prior).expect(401);
    const next = await api().post('/auth/login').send({ email: users.get(editorId)!.email, password: 'temporal-segura-123' }).expect(200);
    await api().get('/eerr').set('Cookie', next.headers['set-cookie']).expect(200);
  });

  it('dos resets intercalados acumulan versión sin mezclar hash y requireChange', async () => {
    const service = app.get(UsersService);
    const results = await Promise.all([
      service.resetPassword(editorId, 'primera-segura-123', true),
      service.resetPassword(editorId, 'segunda-segura-123', false),
    ]);
    expect(results).toHaveLength(2);
    expect(users.get(editorId)?.authVersion).toBe(2);
    expect([
      { passwordHash: 'hash:primera-segura-123', mustChangePassword: true },
      { passwordHash: 'hash:segunda-segura-123', mustChangePassword: false },
    ]).toContainEqual({
      passwordHash: users.get(editorId)?.passwordHash,
      mustChangePassword: users.get(editorId)?.mustChangePassword,
    });
  });

  it('dos cambios propios con el mismo hash previo admiten un único ganador CAS', async () => {
    const auth = app.get(AuthService);
    const outcomes = await Promise.allSettled([
      auth.changePassword(editorId, 'contraseña-vigente', 'primera-segura-123'),
      auth.changePassword(editorId, 'contraseña-vigente', 'segunda-segura-123'),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(users.get(editorId)).toMatchObject({ authVersion: 1, mustChangePassword: false });
    expect(['hash:primera-segura-123', 'hash:segunda-segura-123']).toContain(users.get(editorId)?.passwordHash);
  });

  it('legacy sin authVersion acepta versión cero e invalida tras reset', async () => {
    delete users.get(editorId)!.authVersion;
    const oldCookie = await cookie(editorId);
    await api().get('/auth/me').set('Cookie', oldCookie).expect(200);
    await api().patch(`/users/${editorId}/password`).set('Cookie', await cookie(adminId)).send({ password: 'temporal-segura-123' }).expect(200);
    await api().get('/auth/me').set('Cookie', oldCookie).expect(401);
  });

  it('usuario inactivo recibe login genérico y su cookie previa pierde acceso', async () => {
    const prior = await cookie(editorId);
    await api().patch(`/users/${editorId}/status`).set('Cookie', await cookie(adminId)).send({ active: false }).expect(200);
    await api().get('/auth/me').set('Cookie', prior).expect(401);
    const response = await api().post('/auth/login').send({ email: users.get(editorId)!.email, password: 'contraseña-vigente' }).expect(401);
    expect(response.body.message).toBe('Email o contraseña incorrectos');
    expect(response.body.message).not.toMatch(/inactiv/i);
  });

  it('email duplicado detectado antes del insert devuelve 409', async () => {
    await api().post('/users').set('Cookie', await cookie(adminId)).send({ name: 'Duplicado', email: users.get(editorId)!.email, password: 'temporal-segura-123' }).expect(409);
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('reset propio de Admin, contraseña mínima y credenciales nunca expuestas', async () => {
    const adminCookie = await cookie(adminId);
    await api().patch(`/users/${adminId}/password`).set('Cookie', adminCookie).send({ password: 'corta' }).expect(400);
    const response = await api().patch(`/users/${adminId}/password`).set('Cookie', adminCookie).send({ password: 'temporal-segura-123' }).expect(200);
    expect(users.get(adminId)).toMatchObject({ authVersion: 1, mustChangePassword: true });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('temporal-segura-123');
    await api().get('/auth/me').set('Cookie', adminCookie).expect(401);
  });

  it('convierte carrera E11000 del índice email en 409 y nunca devuelve credenciales', async () => {
    userModel.create.mockRejectedValueOnce({ code: 11000, keyPattern: { email: 1 } });
    const response = await api().post('/users').set('Cookie', await cookie(adminId)).send({ name: 'Nuevo', email: 'nuevo@example.invalid', password: 'temporal-segura-123' }).expect(409);
    expect(JSON.stringify(response.body)).not.toContain('temporal-segura-123');
  });
});

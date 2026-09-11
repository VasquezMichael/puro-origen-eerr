import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { SESSION_COOKIE } from './auth.constants.js';
import type { SessionTokenService } from './session-token.service.js';
import type { UsersService } from '../users/users.service.js';
import { BranchRole } from '../users/user-role.js';

describe('AuthGuard: datos de autorización', () => {
  it('incluye solo identidad y accesos revalidados, sin hash ni permisos del cliente', async () => {
    const access = {
      branchId: '123456789012345678901234',
      role: BranchRole.READER,
    };
    const users = {
      findActiveById: vi
        .fn()
        .mockResolvedValue({
          id: 'user',
          isAdmin: false,
          branchAccesses: [access],
          passwordHash: 'hash-ficticio',
          email: 'test@example.invalid',
        }),
    };
    const tokens = {
      verify: vi.fn().mockResolvedValue({ sub: 'user', isAdmin: true }),
    };
    const guard = new AuthGuard(
      new Reflector(),
      tokens as unknown as SessionTokenService,
      users as unknown as UsersService,
    );
    const req = {
      headers: { cookie: `${SESSION_COOKIE}=ficticio` },
      body: { isAdmin: true },
    } as AuthenticatedRequest;
    const context = {
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({
      sub: 'user',
      isAdmin: false,
      branchAccesses: [access],
    });
    expect(users.findActiveById).toHaveBeenCalledWith('user');
    users.findActiveById.mockResolvedValue({
      id: 'user',
      isAdmin: false,
      branchAccesses: [],
      passwordHash: 'hash-ficticio',
      email: 'test@example.invalid',
    });
    await guard.canActivate(context);
    expect(req.user?.branchAccesses).toEqual([]);
  });
});

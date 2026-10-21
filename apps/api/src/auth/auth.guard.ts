import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UsersService } from '../users/users.service.js';
import { ADMIN_ONLY, IS_PUBLIC, PASSWORD_CHANGE_ALLOWED, SESSION_COOKIE } from './auth.constants.js';
import { SessionTokenService } from './session-token.service.js';
import type { BranchRole } from '../users/user-role.js';

export type AuthenticatedRequest = Request & {
  user?: {
    sub: string;
    isAdmin: boolean;
    branchAccesses: { branchId: string; role: BranchRole }[];
  };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: SessionTokenService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException('Sesión requerida');
    let mustChangePassword = false;
    try {
      const payload = await this.tokens.verify(token);
      const user = await this.users.findActiveById(payload.sub);
      if (!user) throw new UnauthorizedException('Usuario no disponible');
      if ((payload.authVersion ?? 0) !== (user.authVersion ?? 0))
        throw new UnauthorizedException('Sesión invalidada');
      mustChangePassword = user.mustChangePassword;
      request.user = {
        sub: user.id as string,
        isAdmin: user.isAdmin,
        branchAccesses: user.branchAccesses.map(({ branchId, role }) => ({
          branchId,
          role,
        })),
      };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
    const allowedWhileChanging = this.reflector.getAllAndOverride<boolean>(
      PASSWORD_CHANGE_ALLOWED,
      [context.getHandler(), context.getClass()],
    );
    if (mustChangePassword && !allowedWhileChanging)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Debés cambiar tu contraseña antes de continuar',
      });
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (adminOnly && !request.user.isAdmin) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
    return true;
  }

  private readCookie(header: string | undefined, name: string) {
    return header
      ?.split(';')
      .map((item) => item.trim().split('='))
      .find(([key]) => key === name)?.[1];
  }
}

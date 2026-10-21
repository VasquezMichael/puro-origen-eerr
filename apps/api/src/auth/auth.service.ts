import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PasswordService } from '../users/password.service.js';
import { UsersService } from '../users/users.service.js';
import { SessionTokenService } from './session-token.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: SessionTokenService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.users.findByEmailWithPassword(email);
    if (
      !user?.active ||
      !(await this.passwords.verify(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    return {
      token: await this.tokens.sign({
        sub: user.id as string,
        authVersion: user.authVersion ?? 0,
      }),
      user: this.users.toPublicUser(user),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.users.findActiveByIdWithPassword(userId);
    if (
      !user ||
      !(await this.passwords.verify(currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }
    const updated = await this.users.changeOwnPassword(
      userId,
      user.passwordHash,
      newPassword,
    );
    return {
      user: this.users.toPublicUser(updated),
      token: await this.tokens.sign({
        sub: updated.id as string,
        authVersion: updated.authVersion ?? 0,
      }),
    };
  }
}

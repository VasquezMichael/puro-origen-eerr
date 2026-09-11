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
      token: await this.tokens.sign({ sub: user.id as string }),
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
    return this.users.resetPassword(userId, newPassword, false);
  }
}

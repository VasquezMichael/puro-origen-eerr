import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { UsersService } from '../users/users.service.js';
import { Public } from './auth.decorators.js';
import { SESSION_COOKIE } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, user } = await this.auth.login(input.email, input.password);
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });
    return { user };
  }

  @Get('me')
  async me(@Req() request: Request & { user?: { sub: string } }) {
    const user =
      request.user && (await this.users.findActiveById(request.user.sub));
    if (!user) throw new UnauthorizedException('Usuario no disponible');
    return { user: this.users.toPublicUser(user) };
  }

  @Post('password')
  async changePassword(
    @Req() request: Request & { user?: { sub: string } },
    @Body() input: ChangePasswordDto,
  ) {
    if (!request.user) throw new UnauthorizedException('Sesión requerida');
    return {
      user: await this.auth.changePassword(
        request.user.sub,
        input.currentPassword,
        input.newPassword,
      ),
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}

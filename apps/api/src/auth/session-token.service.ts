import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';

export type SessionPayload = { sub: string; authVersion: number };

@Injectable()
export class SessionTokenService {
  private readonly secret: Uint8Array;

  constructor(config: ConfigService) {
    const value = config.getOrThrow<string>('JWT_SECRET');
    if (value.length < 32) {
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    }
    this.secret = new TextEncoder().encode(value);
  }

  sign(payload: SessionPayload) {
    return new SignJWT({ authVersion: payload.authVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(this.secret);
  }

  async verify(token: string): Promise<SessionPayload> {
    const { payload } = await jwtVerify(token, this.secret, {
      algorithms: ['HS256'],
    });
    if (!payload.sub) throw new Error('Token sin sujeto');
    // Los JWT anteriores al despliegue equivalen a versión cero.
    const version = payload.authVersion ?? 0;
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0)
      throw new Error('Versión de sesión inválida');
    return { sub: payload.sub, authVersion: version };
  }
}

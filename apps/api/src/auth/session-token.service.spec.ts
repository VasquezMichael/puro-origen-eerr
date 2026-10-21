import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { SessionTokenService } from './session-token.service.js';

describe('SessionTokenService', () => {
  const config = {
    getOrThrow: () => 'secreto-de-prueba-con-mas-de-32-caracteres',
  } as unknown as ConfigService;

  it('firma y valida una sesión', async () => {
    const service = new SessionTokenService(config);
    const token = await service.sign({ sub: 'usuario-1', authVersion: 2 });
    await expect(service.verify(token)).resolves.toEqual({ sub: 'usuario-1', authVersion: 2 });
  });

  it('normaliza tokens previos sin versión y rechaza una versión malformada', async () => {
    const service = new SessionTokenService(config);
    const secret = new TextEncoder().encode(config.getOrThrow<string>('JWT_SECRET'));
    const legacy = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('usuario-legacy').sign(secret);
    await expect(service.verify(legacy)).resolves.toEqual({ sub: 'usuario-legacy', authVersion: 0 });
    const malformed = await new SignJWT({ authVersion: '2' }).setProtectedHeader({ alg: 'HS256' }).setSubject('usuario-legacy').sign(secret);
    await expect(service.verify(malformed)).rejects.toThrow('Versión de sesión inválida');
  });

  it('rechaza secretos débiles', () => {
    const weakConfig = {
      getOrThrow: () => 'corto',
    } as unknown as ConfigService;
    expect(() => new SessionTokenService(weakConfig)).toThrow(
      'JWT_SECRET debe tener al menos 32 caracteres',
    );
  });
});

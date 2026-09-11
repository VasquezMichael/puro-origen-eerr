import { ConfigService } from '@nestjs/config';
import { SessionTokenService } from './session-token.service.js';

describe('SessionTokenService', () => {
  const config = {
    getOrThrow: () => 'secreto-de-prueba-con-mas-de-32-caracteres',
  } as unknown as ConfigService;

  it('firma y valida una sesión', async () => {
    const service = new SessionTokenService(config);
    const token = await service.sign({ sub: 'usuario-1' });
    await expect(service.verify(token)).resolves.toEqual({ sub: 'usuario-1' });
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

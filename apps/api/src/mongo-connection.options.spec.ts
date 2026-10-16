import type { ConfigService } from '@nestjs/config';
import { mongoConnectionOptions } from './mongo-connection.options.js';

describe('política de índices de la conexión Mongoose', () => {
  const optionsFor = (environment: string | undefined) => {
    const config = {
      get: vi.fn((key: string) =>
        key === 'NODE_ENV' ? environment : undefined,
      ),
      getOrThrow: vi.fn((key: string) =>
        key === 'MONGODB_URI' ? 'test-uri' : undefined,
      ),
    } as unknown as ConfigService;
    const options = mongoConnectionOptions(config);
    expect(config.get).toHaveBeenCalledWith('NODE_ENV');
    expect(config.getOrThrow).toHaveBeenCalledWith('MONGODB_URI');
    return options;
  };

  it('desactiva autoIndex en producción', () => {
    expect(optionsFor('production')).toEqual({
      uri: 'test-uri',
      autoIndex: false,
    });
  });

  it.each(['development', 'test', 'staging'])(
    'habilita autoIndex en entorno no productivo explícito (%s)',
    (environment) => {
      expect(optionsFor(environment).autoIndex).toBe(true);
    },
  );

  it.each([undefined, 'unknown'])(
    'desactiva autoIndex sin entorno no productivo explícito (%s)',
    (environment) => {
      expect(optionsFor(environment).autoIndex).toBe(false);
    },
  );
});

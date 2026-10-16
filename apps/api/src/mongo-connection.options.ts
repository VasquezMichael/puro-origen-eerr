import type { ConfigService } from '@nestjs/config';

/** Solo entornos no productivos conocidos pueden crear índices al iniciar. */
export function mongoConnectionOptions(config: ConfigService) {
  const environment = config.get<string>('NODE_ENV');
  return {
    uri: config.getOrThrow<string>('MONGODB_URI'),
    autoIndex:
      environment === 'development' ||
      environment === 'test' ||
      environment === 'staging',
  };
}

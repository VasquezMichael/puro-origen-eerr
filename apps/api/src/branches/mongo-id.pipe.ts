import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export function requireMongoId(value: string) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw new BadRequestException('Identificador de MongoDB inválido');
  }
  return value.toLowerCase();
}

@Injectable()
export class MongoIdPipe implements PipeTransform<string, string> {
  transform(value: string) {
    return requireMongoId(value);
  }
}

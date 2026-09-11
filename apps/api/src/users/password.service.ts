import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

@Injectable()
export class PasswordService {
  private readonly rounds = 12;

  hash(value: string): Promise<string> {
    return hash(value, this.rounds);
  }

  verify(value: string, passwordHash: string): Promise<boolean> {
    return compare(value, passwordHash);
  }
}

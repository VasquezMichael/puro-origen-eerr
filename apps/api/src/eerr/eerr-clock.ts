import { Injectable } from '@nestjs/common';

@Injectable()
export class EerrClock {
  now(): Date {
    return new Date();
  }
}

import { Injectable, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { EerrClock } from './eerr-clock.js';
import type { CloneMode } from '@puro-origen/domain';
export type CloneTicket = {
  actor: string;
  source: string;
  destination: string;
  mode: CloneMode;
  sourceRevision: number;
  destinationRevision: number;
  fingerprint: string;
  expires: number;
};
/** Signed read-only preview: scoped HMAC prevents using this token as an authentication token. */
@Injectable()
export class ClonePreviewToken {
  private readonly key: Buffer;
  constructor(
    config: ConfigService,
    private readonly clock: EerrClock,
  ) {
    const secret = config.getOrThrow<string>('JWT_SECRET');
    if (secret.length < 32)
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    this.key = createHmac('sha256', secret)
      .update('puro-origen:eerr-clone-preview:v1')
      .digest();
  }
  sign(ticket: Omit<CloneTicket, 'expires'>): string {
    const payload = Buffer.from(
      JSON.stringify({
        ...ticket,
        expires: this.clock.now().getTime() + 300000,
      }),
    ).toString('base64url');
    return `${payload}.${this.mac(payload).toString('base64url')}`;
  }
  verify(token: string): CloneTicket {
    try {
      const [payload, signature, ...extra] = token.split('.');
      if (!payload || !signature || extra.length) throw new Error();
      const expected = this.mac(payload),
        actual = Buffer.from(signature, 'base64url');
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new Error();
      const ticket = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as CloneTicket;
      if (
        !Number.isFinite(ticket.expires) ||
        ticket.expires <= this.clock.now().getTime()
      )
        throw new Error();
      return ticket;
    } catch {
      throw new ConflictException(
        'La vista previa venció o no es válida. Generá una nueva.',
      );
    }
  }
  private mac(payload: string) {
    return createHmac('sha256', this.key).update(payload).digest();
  }
}

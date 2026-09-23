import { Injectable, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { EerrClock } from '../eerr-clock.js';
export type TemplateTicket = {
  kind: 'template';
  id: string;
  identity: string;
  version: number;
};
export type PreviewTicket = {
  kind: 'preview';
  id: string;
  actor: string;
  identity: string;
  revision: number;
  digest: string;
  planDigest: string;
  expires: number;
};
export type CompletePendingTicket = {
  kind: 'complete-pending';
  id: string;
  actor: string;
  revision: number;
  fingerprint: string;
  planDigest: string;
  expires: number;
};
type Ticket = TemplateTicket | PreviewTicket | CompletePendingTicket;
export const IMPORT_PREVIEW_MS = 300000;
export const importConflict = () =>
  new ConflictException(
    'El EERR, archivo o preview cambió. Conservá el archivo y generá una nueva vista previa.',
  );
@Injectable()
export class ImportToken {
  private readonly key: Buffer;
  constructor(
    config: ConfigService,
    private readonly clock: EerrClock,
  ) {
    const secret = config.getOrThrow<string>('JWT_SECRET');
    if (secret.length < 32)
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    this.key = createHmac('sha256', secret)
      .update('puro-origen:eerr-import:v1')
      .digest();
  }
  sign(ticket: Ticket) {
    const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
    return payload + '.' + this.mac(payload).toString('base64url');
  }
  verify<T extends Ticket>(token: string, kind: T['kind']): T {
    try {
      const [payload, signature, ...extra] = token.split('.');
      if (!payload || !signature || extra.length || token.length > 4096)
        throw Error();
      const actual = Buffer.from(signature, 'base64url'),
        expected = this.mac(payload);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw Error();
      const ticket = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as T;
      if (
        ticket.kind !== kind ||
        (ticket.kind !== 'template' &&
          (!Number.isFinite(ticket.expires) ||
            ticket.expires <= this.clock.now().getTime()))
      )
        throw Error();
      return ticket;
    } catch {
      throw importConflict();
    }
  }
  private mac(payload: string) {
    return createHmac('sha256', this.key).update(payload).digest();
  }
}

import { ConfigService } from '@nestjs/config';
import { ClonePreviewToken } from './clone-preview-token.js';
import { EerrClock } from './eerr-clock.js';
describe('preview firmado de clonación, sin persistencia ni entorno', () => {
  let now: Date;
  let tokens: ClonePreviewToken;
  const ticket = {
    actor: 'fixture-user',
    source: 'source',
    destination: 'destination',
    mode: 'ESTRUCTURA' as const,
    sourceRevision: 4,
    destinationRevision: 0,
    fingerprint: 'fixture-fingerprint',
  };
  beforeEach(() => {
    now = new Date('2026-09-01T12:00:00Z');
    tokens = new ClonePreviewToken(
      new ConfigService({
        JWT_SECRET: 'test-only-not-a-real-secret-000000000000',
      }),
      { now: () => now } as EerrClock,
    );
  });
  it('vincula actor, modo, extremos y revisiones sin guardar preview', () => {
    expect(tokens.verify(tokens.sign(ticket))).toEqual({
      ...ticket,
      expires: now.getTime() + 300000,
    });
  });
  it('rechaza datos manipulados', () => {
    const token = tokens.sign(ticket),
      [, signature] = token.split('.');
    const payload = Buffer.from(
      JSON.stringify({
        ...ticket,
        actor: 'other',
        expires: now.getTime() + 300000,
      }),
    ).toString('base64url');
    expect(() => tokens.verify(`${payload}.${signature}`)).toThrow(
      'vista previa',
    );
  });
  it('vence con reloj inyectable', () => {
    const token = tokens.sign(ticket);
    now = new Date(now.getTime() + 300000);
    expect(() => tokens.verify(token)).toThrow('vista previa');
  });
  it.each(['', 'x.y', 'x', 'x.y.z'])('rechaza token inválido %s', (token) => {
    expect(() => tokens.verify(token)).toThrow('vista previa');
  });
});

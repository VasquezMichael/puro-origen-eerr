import { Types } from 'mongoose';
import {
  ACTIVE_EERR_FILTER,
  eerrLifecycle,
  isActiveEerr,
} from './eerr-lifecycle.js';

describe('normalización de lifecycle legacy y soft delete', () => {
  it('interpreta documentos lean anteriores como abiertos, nunca cerrados y activos', () => {
    expect(eerrLifecycle({})).toEqual({
      lifecycleStatus: 'OPEN',
      everClosed: false,
      closedAt: null,
      closedBy: null,
      deletedAt: null,
      deletedBy: null,
    });
    expect(isActiveEerr({})).toBe(true);
    expect(isActiveEerr({ deletedAt: null })).toBe(true);
    expect(ACTIVE_EERR_FILTER).toEqual({ deletedAt: null });
  });

  it('conserva cierre y borrado persistidos sin inferir historial ausente', () => {
    const actor = new Types.ObjectId();
    const at = new Date('2026-10-15T10:00:00.000Z');
    expect(
      eerrLifecycle({
        lifecycleStatus: 'CLOSED',
        everClosed: true,
        closedAt: at,
        closedBy: actor,
        deletedAt: at,
        deletedBy: actor,
      }),
    ).toEqual({
      lifecycleStatus: 'CLOSED',
      everClosed: true,
      closedAt: at.toISOString(),
      closedBy: actor.toString(),
      deletedAt: at.toISOString(),
      deletedBy: actor.toString(),
    });
    expect(isActiveEerr({ deletedAt: at })).toBe(false);
  });
});

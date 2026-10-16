import type {
  EerrLifecycleStatus,
  EerrLifecycleState,
} from '@puro-origen/shared-types';

export const ACTIVE_EERR_FILTER = { deletedAt: null } as const;

type LifecycleFields = {
  lifecycleStatus?: EerrLifecycleStatus | null;
  everClosed?: boolean | null;
  closedAt?: Date | null;
  closedBy?: { toString(): string } | null;
  deletedAt?: Date | null;
  deletedBy?: { toString(): string } | null;
};

/** Normaliza también resultados lean y documentos anteriores a EP-07. */
export function eerrLifecycle(row: LifecycleFields): EerrLifecycleState {
  return {
    lifecycleStatus: row.lifecycleStatus ?? 'OPEN',
    everClosed: row.everClosed ?? false,
    closedAt: row.closedAt?.toISOString() ?? null,
    closedBy: row.closedBy?.toString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    deletedBy: row.deletedBy?.toString() ?? null,
  };
}

export function isActiveEerr(row: Pick<LifecycleFields, 'deletedAt'>): boolean {
  return row.deletedAt == null;
}

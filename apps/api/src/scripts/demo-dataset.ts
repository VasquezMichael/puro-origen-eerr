import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose, { Types, type ClientSession, type Connection } from 'mongoose';
import {
  assertStructure,
  eerrCalendarIssue,
  evaluateMoneyExpression,
  initialNodes,
  normalizeNote,
  normalizeQuantity,
  normalizeSalesGoal,
  NOTE_LIMITS,
  type EerrStructure,
  type StructureNode,
} from '@puro-origen/domain';
import {
  aggregateEerr,
  calculateEerr,
  compareMetricValues,
} from '@puro-origen/calculation-engine';
import { normalizeBranchName } from '../branches/branch-name.js';
import { storedStructure } from '../eerr/schemas/structure.schema.js';
import {
  DEMO_BRANCHES,
  DEMO_CATEGORIES,
  DEMO_CODE,
  DEMO_GOALS,
  DEMO_ITEMS,
  DEMO_NOTE,
  DEMO_PERIODS,
  DEMO_PURPOSE,
  DEMO_SLOTS,
} from './demo-dataset.manifest.js';

const EJSON = mongoose.mongo.BSON.EJSON;
const BACKUP_DIR = resolve(
  fileURLToPath(
    new URL('../../../../.local/demo-dataset-backups/', import.meta.url),
  ),
);
const API_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));
export const APPLY_PHRASE = 'APLICAR DATASET DEMO INTEGRAL';
export const CLEAN_PHRASE = 'ELIMINAR SEIS EERR DEMO';
export const RESTORE_PHRASE = 'RESTAURAR BACKUP DATASET DEMO';
type BranchRow = {
  _id: Types.ObjectId;
  name: string;
  normalizedName?: string;
  startDate: Date;
  active: boolean;
};
type ActorRow = { _id: Types.ObjectId; isAdmin: boolean; active: boolean };
type EerrRow = Record<string, unknown> & {
  _id: string;
  branchId: Types.ObjectId;
  year: number;
  month: number;
  revision?: number;
  structure?: { nodes?: unknown[] } | null;
  note?: string;
  salesGoal?: unknown;
  createdAt?: Date;
  createdBy?: Types.ObjectId;
};
type TemplateRow = {
  _id: string;
  version: number;
  gate: number;
  categories: unknown[];
};
type ConceptRow = { _id: string; kind: 'CATEGORY' | 'ITEM'; rootCode: string };
type DemoApplication = {
  _id: string;
  manifestHash: string;
  appliedAt: Date;
  actorId: string;
  eerrs: { slot: string; id: string; documentHash: string }[];
  templates: { key: string; documentHash: string }[];
  concepts: { code: string; documentHash: string }[];
  createdConceptCodes: string[];
  priorTemplates: TemplateRow[];
};
type Slot = {
  name: string;
  branch: BranchRow;
  year: number;
  month: number;
  existing: EerrRow | null;
  operation: 'CREATE' | 'REPLACE' | 'PRESERVE';
  analysis: ReturnType<typeof calculateEerr>;
};
type Snapshot = {
  branches: BranchRow[];
  actor: ActorRow;
  eerrs: EerrRow[];
  templates: TemplateRow[];
  concepts: ConceptRow[];
  application: DemoApplication | null;
  foreignCodeUse: boolean;
};
type BackupPayload = {
  format: number;
  action: 'apply' | 'clean';
  database: string;
  clusterFingerprint: string;
  planHash: string;
  manifest: string;
  snapshots: Pick<Snapshot, 'eerrs' | 'templates' | 'concepts' | 'application'>;
  checksum: string;
};
export type DemoPlan = {
  database: string;
  clusterFingerprint: string;
  manifest: string;
  purpose: string;
  hash: string;
  slots: Slot[];
  snapshots: Snapshot;
  summary: unknown;
  warnings: string[];
  asOf: Date;
};

export class DemoPlanError extends Error {}
const fail = (message: string): never => {
  throw new DemoPlanError(message);
};
const hash = (value: unknown) =>
  createHash('sha256').update(EJSON.stringify(value)).digest('hex');
const manifestHash = () =>
  hash({
    code: DEMO_CODE,
    categories: DEMO_CATEGORIES,
    items: DEMO_ITEMS,
    goals: DEMO_GOALS,
    note: DEMO_NOTE,
  });
const stateHash = (database: string, snapshots: Snapshot) =>
  hash({
    database,
    manifest: {
      code: DEMO_CODE,
      categories: DEMO_CATEGORIES,
      items: DEMO_ITEMS,
      goals: DEMO_GOALS,
      note: DEMO_NOTE,
    },
    branches: snapshots.branches,
    actor: snapshots.actor,
    eerrs: snapshots.eerrs,
    templates: snapshots.templates,
    concepts: snapshots.concepts,
    ...(snapshots.application ? { application: snapshots.application } : {}),
  });
const periodKey = (year: number, month: number) => `${year}-${month}`;
const codeRoot = (code: string) => {
  const item = DEMO_ITEMS.find((candidate) => candidate.code === code);
  const category = DEMO_CATEGORIES.find(
    (candidate) => candidate.code === (item?.categoryCode ?? code),
  );
  if (!category) fail('Código de concepto desconocido en el manifiesto');
  return category!.parentCode;
};
const templateMatches = (template: TemplateRow | undefined) =>
  Boolean(
    template &&
    EJSON.stringify(
      template.categories.map((row) => {
        const category = row as {
          code: string;
          parentCode: string;
          name: string;
          position: number;
        };
        return {
          code: category.code,
          parentCode: category.parentCode,
          name: category.name,
          position: category.position,
        };
      }),
    ) === EJSON.stringify(DEMO_CATEGORIES),
  );
const contentMatched = (plan: DemoPlan) =>
  plan.slots.every((slot) => slot.operation === 'PRESERVE') &&
  DEMO_PERIODS.every((period) =>
    templateMatches(
      plan.snapshots.templates.find(
        (row) => row._id === periodKey(period.year, period.month),
      ),
    ),
  ) &&
  plan.snapshots.concepts.length === DEMO_CATEGORIES.length + DEMO_ITEMS.length;

function applicationMatches(plan: DemoPlan): boolean {
  const application = plan.snapshots.application;
  if (!application || application.manifestHash !== manifestHash()) return false;
  const allowedConceptCodes = new Set(
    [...DEMO_CATEGORIES, ...DEMO_ITEMS].map((row) => row.code),
  );
  if (
    !Array.isArray(application.createdConceptCodes) ||
    !Array.isArray(application.priorTemplates) ||
    application.createdConceptCodes.some(
      (code) => !allowedConceptCodes.has(code),
    ) ||
    application.priorTemplates.some(
      (row) => !['2026-8', '2026-9'].includes(row._id),
    )
  )
    return false;
  if (
    !Array.isArray(application.eerrs) ||
    !Array.isArray(application.templates) ||
    !Array.isArray(application.concepts) ||
    application.eerrs.length !== 6 ||
    application.templates.length !== 2 ||
    application.concepts.length !==
      DEMO_CATEGORIES.length + DEMO_ITEMS.length ||
    new Set(application.eerrs.map((row) => row.slot)).size !== 6 ||
    new Set(application.eerrs.map((row) => row.id)).size !== 6 ||
    new Set(application.templates.map((row) => row.key)).size !== 2 ||
    new Set(application.concepts.map((row) => row.code)).size !==
      allowedConceptCodes.size ||
    new Set(application.createdConceptCodes).size !==
      application.createdConceptCodes.length ||
    new Set(application.priorTemplates.map((row) => row._id)).size !==
      application.priorTemplates.length ||
    application.templates.some(
      (row) => !['2026-8', '2026-9'].includes(row.key),
    ) ||
    application.concepts.some((row) => !allowedConceptCodes.has(row.code))
  )
    return false;
  return (
    plan.slots.every((slot) => {
      const entry = application.eerrs.find((row) => row.slot === slot.name);
      return Boolean(
        slot.existing &&
        entry?.id === slot.existing._id &&
        entry.documentHash === hash(slot.existing),
      );
    }) &&
    application.templates.every((entry) => {
      const row = plan.snapshots.templates.find(
        (candidate) => candidate._id === entry.key,
      );
      return Boolean(row && entry.documentHash === hash(row));
    }) &&
    application.concepts.every((entry) => {
      const row = plan.snapshots.concepts.find(
        (candidate) => candidate._id === entry.code,
      );
      return Boolean(row && entry.documentHash === hash(row));
    })
  );
}
const allMatched = (plan: DemoPlan) =>
  contentMatched(plan) && applicationMatches(plan);

export function buildDemoStructure(
  slotIndex: number,
  actorId: string,
  at: Date,
  uuid = randomUUID,
  structureVersion = 1,
): EerrStructure {
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= DEMO_SLOTS.length
  )
    fail('Slot ajeno al manifiesto');
  const nodes = initialNodes([...DEMO_CATEGORIES], uuid);
  for (const definition of DEMO_ITEMS) {
    const parent = nodes.find((node) => node.code === definition.categoryCode)!;
    const evaluated = evaluateMoneyExpression(definition.values[slotIndex]!);
    const node: StructureNode = {
      nodeId: uuid(),
      code: definition.code,
      parentId: parent.nodeId,
      position: nodes.filter(
        (candidate) => candidate.parentId === parent.nodeId,
      ).length,
      name: definition.name,
      kind: 'ITEM',
      amount: {
        state: 'CARGADO',
        input: evaluated.input,
        value: evaluated.value,
        currency: 'ARS',
        scale: 2,
      },
      quantityEnabled: Boolean(definition.quantities),
      unit: definition.unit ?? null,
      ...(definition.quantities
        ? {
            quantity: {
              state: 'CARGADO' as const,
              value: normalizeQuantity(definition.quantities[slotIndex]!),
            },
          }
        : {}),
      ...(definition.note
        ? { note: normalizeNote(definition.note, NOTE_LIMITS.item) }
        : {}),
    };
    nodes.push(node);
  }
  assertStructure(nodes);
  return {
    schemaVersion: 1,
    structureVersion,
    initializedAt: at.toISOString(),
    initializedBy: actorId,
    nodes,
  };
}

function contentSignature(row: EerrRow): string | null {
  if (!row.structure || !Array.isArray(row.structure.nodes)) return null;
  const nodes = row.structure.nodes as StructureNode[];
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  return hash({
    note: row.note ?? null,
    goal:
      row.salesGoal && typeof row.salesGoal === 'object'
        ? (() => {
            const goal = row.salesGoal as {
              mode: string;
              value: { toString(): string };
            };
            return { mode: goal.mode, value: goal.value.toString() };
          })()
        : null,
    nodes: nodes.map((node) => ({
      code: node.code,
      kind: node.kind,
      name: node.name,
      position: node.position,
      parentCode: node.parentId === null ? null : byId.get(node.parentId)?.code,
      amount: node.amount
        ? { ...node.amount, value: node.amount.value?.toString() ?? null }
        : null,
      quantityEnabled: node.quantityEnabled ?? false,
      quantity: node.quantity ?? null,
      unit: node.unit ?? null,
      note: node.note ?? null,
      archive: node.archive ?? null,
    })),
  });
}

function expectedSignature(index: number): string {
  const actor = '000000000000000000000000';
  const structure = buildDemoStructure(
    index,
    actor,
    new Date('2026-10-01T12:00:00Z'),
    (() => {
      let n = 1000;
      return () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`;
    })(),
  );
  const goal = normalizeSalesGoal(DEMO_GOALS[index]);
  return contentSignature({
    _id: '',
    branchId: new Types.ObjectId(),
    year: 2026,
    month: 8,
    structure,
    note: DEMO_NOTE,
    salesGoal: goal,
  })!;
}

export function expectedDemoResults() {
  const analyses = DEMO_SLOTS.map((_, index) =>
    calculateEerr(
      buildDemoStructure(
        index,
        '000000000000000000000000',
        new Date('2026-10-01T12:00:00Z'),
        randomUUID,
      ),
      normalizeSalesGoal(DEMO_GOALS[index]),
    ),
  );
  const consolidated = DEMO_PERIODS.map((period) =>
    aggregateEerr(
      DEMO_BRANCHES.map((name, branchIndex) => ({
        branchId: name,
        analysis: analyses[branchIndex * 2 + (period.month === 8 ? 0 : 1)]!,
      })),
    ),
  );
  const compare = (
    left: ReturnType<typeof calculateEerr>,
    right: ReturnType<typeof calculateEerr>,
  ) => ({
    sales: compareMetricValues(
      left.blocks[0]!.value,
      right.blocks[0]!.value,
      'ARS',
    ),
    netResult: compareMetricValues(
      left.metrics.netResult.value,
      right.metrics.netResult.value,
      'ARS',
    ),
  });
  return {
    perEerr: DEMO_SLOTS.map((slot, index) => ({
      slot,
      blocks: analyses[index]!.blocks.map(({ name, value }) => ({
        name,
        value,
      })),
      metrics: analyses[index]!.metrics,
      projections: analyses[index]!.projections,
    })),
    consolidated: DEMO_PERIODS.map((period, index) => ({
      period,
      result: consolidated[index],
    })),
    monthlyComparisons: DEMO_BRANCHES.map((name, index) => ({
      name,
      result: compare(analyses[index * 2 + 1]!, analyses[index * 2]!),
    })),
    branchComparisons: DEMO_PERIODS.map((period, index) => ({
      period,
      results: DEMO_BRANCHES.slice(1).map((name, branchIndex) => ({
        against: `CALLE 13 / ${name}`,
        result: compare(
          analyses[index]!,
          analyses[(branchIndex + 1) * 2 + index]!,
        ),
      })),
    })),
  };
}

async function readSnapshot(
  connection: Connection,
  session?: ClientSession,
  asOf = new Date(),
): Promise<Snapshot> {
  const db = connection.db!;
  const branches = await db
    .collection<BranchRow>('branches')
    .find(
      {},
      {
        projection: {
          _id: 1,
          name: 1,
          normalizedName: 1,
          startDate: 1,
          active: 1,
        },
        session,
      },
    )
    .toArray();
  const resolved = DEMO_BRANCHES.map((name) => {
    const matches = branches.filter(
      (row) => normalizeBranchName(row.name) === normalizeBranchName(name),
    );
    if (matches.length !== 1)
      fail(
        `Sucursal ${name}: se encontraron ${matches.length}; se requiere una coincidencia exacta`,
      );
    const branch = matches[0]!;
    if (!branch.active || !(branch.startDate instanceof Date))
      fail(`Sucursal ${name}: inactiva o sin fecha de inicio válida`);
    return branch;
  });
  const admins = await db
    .collection<ActorRow>('users')
    .find(
      { isAdmin: true, active: true },
      { projection: { _id: 1, isAdmin: 1, active: 1 }, session },
    )
    .limit(2)
    .toArray();
  if (admins.length !== 1)
    fail(
      'Debe existir exactamente un administrador activo para atribuir la carga',
    );
  for (const branch of resolved)
    for (const period of DEMO_PERIODS) {
      const issue = eerrCalendarIssue(period, branch.startDate, asOf);
      if (issue)
        fail(
          `Período ${periodKey(period.year, period.month)} de ${branch.name}: ${issue}`,
        );
    }
  const eerrs = await db
    .collection<EerrRow>('eerr')
    .find({ year: 2026, month: { $in: [8, 9] } }, { session })
    .sort({ branchId: 1, year: 1, month: 1, _id: 1 })
    .toArray();
  const allowed = new Set(resolved.map((branch) => branch._id.toString()));
  if (eerrs.some((row) => !allowed.has(row.branchId.toString())))
    fail(
      'Hay EERR de otras sucursales en agosto/septiembre; la plantilla global podría afectarlos',
    );
  for (const branch of resolved)
    for (const period of DEMO_PERIODS) {
      if (
        eerrs.filter(
          (row) =>
            row.branchId.toString() === branch._id.toString() &&
            row.year === period.year &&
            row.month === period.month,
        ).length > 1
      )
        fail(
          `EERR duplicados para ${branch.name} / ${periodKey(period.year, period.month)}`,
        );
    }
  const templates = await db
    .collection<TemplateRow>('eerr_templates')
    .find(
      {
        _id: {
          $in: DEMO_PERIODS.map((period) =>
            periodKey(period.year, period.month),
          ),
        },
      },
      { session },
    )
    .sort({ _id: 1 })
    .toArray();
  const codes = [
    ...DEMO_CATEGORIES.map((row) => row.code),
    ...DEMO_ITEMS.map((row) => row.code),
  ];
  const concepts = await db
    .collection<ConceptRow>('eerr_concepts')
    .find({ _id: { $in: codes } }, { session })
    .sort({ _id: 1 })
    .toArray();
  for (const concept of concepts) {
    if (
      concept.rootCode !== codeRoot(concept._id) ||
      concept.kind !==
        (DEMO_CATEGORIES.some((row) => row.code === concept._id)
          ? 'CATEGORY'
          : 'ITEM')
    )
      fail(`Conflicto de catálogo para el código ${concept._id}`);
  }
  const application = await db
    .collection<DemoApplication>('eerr_demo_applications')
    .findOne({ _id: DEMO_CODE }, { session });
  const reusedInEerr = await db.collection<EerrRow>('eerr').findOne(
    {
      $or: [{ year: { $ne: 2026 } }, { month: { $nin: [8, 9] } }],
      'structure.nodes.code': { $in: codes },
    },
    { projection: { _id: 1 }, session },
  );
  const reusedInTemplate = await db
    .collection<TemplateRow>('eerr_templates')
    .findOne(
      {
        _id: { $nin: ['2026-8', '2026-9'] },
        'categories.code': { $in: DEMO_CATEGORIES.map((row) => row.code) },
      },
      { projection: { _id: 1 }, session },
    );
  const foreignCodeUse = Boolean(reusedInEerr || reusedInTemplate);
  return {
    branches: resolved,
    actor: admins[0]!,
    eerrs,
    templates,
    concepts,
    application,
    foreignCodeUse,
  };
}

export async function makeDemoPlan(
  connection: Connection,
  database: string,
  clusterFingerprint: string,
  session?: ClientSession,
  asOf = new Date(),
): Promise<DemoPlan> {
  const snapshots = await readSnapshot(connection, session, asOf);
  const slots: Slot[] = DEMO_SLOTS.map((name, index) => {
    const branch = snapshots.branches[Math.floor(index / 2)]!;
    const month = index % 2 === 0 ? 8 : 9;
    const existing =
      snapshots.eerrs.find(
        (row) =>
          row.branchId.toString() === branch._id.toString() &&
          row.month === month,
      ) ?? null;
    let operation: Slot['operation'] = 'CREATE';
    if (existing)
      operation =
        existing.loadStatus === 'CARGADO' &&
        contentSignature(existing) === expectedSignature(index)
          ? 'PRESERVE'
          : 'REPLACE';
    return {
      name,
      branch,
      year: 2026,
      month,
      existing,
      operation,
      analysis: calculateEerr(
        buildDemoStructure(
          index,
          snapshots.actor._id.toString(),
          new Date('2026-10-01T12:00:00Z'),
        ),
        normalizeSalesGoal(DEMO_GOALS[index]),
      ),
    };
  });
  const warnings = [
    'Los EERR existentes se consideran datos de prueba solo por la declaración del responsable; revisar sus IDs y contenido antes de apply.',
    'Las plantillas mensuales se reemplazarían de forma coordinada; no se modifica ninguna otra sucursal ni período.',
    'Los EERR existentes conservarían _id, createdAt y createdBy; revision avanzaría y updatedAt cambiaría.',
  ];
  if (snapshots.foreignCodeUse)
    warnings.push(
      'Un código del manifiesto aparece en otro período; apply inicial queda bloqueado y clean conserva conceptos compartidos.',
    );
  return {
    database,
    clusterFingerprint,
    manifest: DEMO_CODE,
    purpose: DEMO_PURPOSE,
    hash: stateHash(database, snapshots),
    slots,
    snapshots,
    summary: expectedDemoResults(),
    warnings,
    asOf,
  };
}

export function publicDemoPlan(plan: DemoPlan) {
  return {
    database: plan.database,
    clusterFingerprint: plan.clusterFingerprint,
    manifest: plan.manifest,
    purpose: plan.purpose,
    hash: plan.hash,
    branches: plan.snapshots.branches.map((row) => ({
      name: row.name,
      id: row._id.toString(),
      startDate: row.startDate.toISOString(),
    })),
    actor: {
      id: plan.snapshots.actor._id.toString(),
      kind: 'administrador activo único',
    },
    eerrs: plan.slots.map((slot) => ({
      slot: slot.name,
      branchId: slot.branch._id.toString(),
      id: slot.existing?._id ?? null,
      revision: slot.existing?.revision ?? null,
      action: slot.operation,
      existingContent: slot.existing
        ? {
            structure: Boolean(slot.existing.structure),
            itemCount:
              slot.existing.structure?.nodes?.filter(
                (node) => (node as { kind?: string }).kind === 'ITEM',
              ).length ?? 0,
            loadedAmounts:
              slot.existing.structure?.nodes?.filter(
                (node) =>
                  (node as { amount?: { state?: string } }).amount?.state ===
                  'CARGADO',
              ).length ?? 0,
            note: Boolean(slot.existing.note),
            goal: Boolean(slot.existing.salesGoal),
          }
        : null,
    })),
    nodes: {
      blocks: 3,
      categories: DEMO_CATEGORIES.length,
      items: DEMO_ITEMS.length,
      perEerr: 3 + DEMO_CATEGORIES.length + DEMO_ITEMS.length,
      totalAmounts: DEMO_ITEMS.length * 6,
      totalGoals: 6,
      periodNotes: 6,
      itemNotes: DEMO_ITEMS.filter((row) => row.note).length * 6,
    },
    templates: DEMO_PERIODS.map((period) => {
      const row = plan.snapshots.templates.find(
        (candidate) => candidate._id === periodKey(period.year, period.month),
      );
      return {
        period,
        action: row
          ? templateMatches(row)
            ? 'PRESERVE'
            : 'REPLACE'
          : 'CREATE',
        version: row?.version ?? null,
      };
    }),
    concepts: {
      existing: plan.snapshots.concepts.length,
      create:
        DEMO_CATEGORIES.length +
        DEMO_ITEMS.length -
        plan.snapshots.concepts.length,
    },
    application: plan.snapshots.application
      ? {
          registered: true,
          exact: applicationMatches(plan),
          eerrIds: plan.snapshots.application.eerrs.map((row) => row.id),
        }
      : { registered: false, exact: false, eerrIds: [] },
    results: plan.summary,
    warnings: plan.warnings,
    hypotheticalApplyCommand: `npm run demo:dataset --workspace=api -- apply --database ${plan.database} --plan-hash ${plan.hash} --confirm "${APPLY_PHRASE}"`,
  };
}

function validateConfirm(
  action: 'apply' | 'clean',
  options: { database?: string; planHash?: string; confirm?: string },
  plan: DemoPlan,
) {
  if (options.database !== plan.database)
    fail('La confirmación de la base no coincide');
  if (options.confirm !== (action === 'apply' ? APPLY_PHRASE : CLEAN_PHRASE))
    fail('Frase de confirmación incorrecta');
  if (
    options.planHash !== plan.hash &&
    !(action === 'apply' && allMatched(plan))
  )
    fail('El plan cambió; ejecutar plan nuevamente');
}

async function backup(plan: DemoPlan, action: 'apply' | 'clean') {
  await mkdir(BACKUP_DIR, { recursive: true });
  const path = join(
    BACKUP_DIR,
    `${DEMO_CODE}-${action}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`,
  );
  const snapshots = {
    eerrs: plan.snapshots.eerrs,
    templates: plan.snapshots.templates,
    concepts: plan.snapshots.concepts,
    application: plan.snapshots.application,
  };
  const payload: BackupPayload = {
    format: 1,
    action,
    database: plan.database,
    clusterFingerprint: plan.clusterFingerprint,
    planHash: plan.hash,
    manifest: DEMO_CODE,
    snapshots,
    checksum: hash(snapshots),
  };
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(EJSON.stringify(payload));
    await handle.sync();
  } finally {
    await handle.close();
  }
  const verified = await readDemoBackup(path);
  if (verified.checksum !== payload.checksum)
    fail('No se pudo validar el backup');
  return path;
}

export async function applyDemo(
  connection: Connection,
  plan: DemoPlan,
  options: { database?: string; planHash?: string; confirm?: string },
  onWrite?: () => void,
) {
  validateConfirm('apply', options, plan);
  if (plan.snapshots.foreignCodeUse && !plan.snapshots.application)
    fail(
      'Un código del manifiesto ya se usa fuera de los dos períodos; se requiere revisión',
    );
  if (plan.snapshots.application && !allMatched(plan))
    fail(
      'Existe un registro de aplicación alterado; se requiere revisión humana',
    );
  if (allMatched(plan)) return { noOp: true, backup: null };
  if (contentMatched(plan))
    fail(
      'El contenido coincide, pero no existe registro de aplicación; se requiere revisión humana',
    );
  const backupPath = await backup(plan, 'apply');
  const session = await connection.startSession();
  try {
    await session.withTransaction(
      async () => {
        const current = await makeDemoPlan(
          connection,
          plan.database,
          plan.clusterFingerprint,
          session,
          plan.asOf,
        );
        if (current.hash !== plan.hash)
          fail('Una fuente cambió desde plan; no se aplicaron escrituras');
        if (current.snapshots.foreignCodeUse && !current.snapshots.application)
          fail(
            'Un código del manifiesto apareció fuera de alcance; no se aplicaron escrituras',
          );
        const db = connection.db!;
        for (let index = 0; index < plan.slots.length; index++) {
          const slot = plan.slots[index]!;
          if (slot.operation === 'PRESERVE') continue;
          const now = new Date();
          const previousTemplate = plan.snapshots.templates.find(
            (row) => row._id === periodKey(slot.year, slot.month),
          );
          const templateVersion = templateMatches(previousTemplate)
            ? previousTemplate!.version
            : (previousTemplate?.version ?? 0) + 1;
          const structure = buildDemoStructure(
            index,
            plan.snapshots.actor._id.toString(),
            now,
            randomUUID,
            templateVersion,
          );
          const goal = normalizeSalesGoal(DEMO_GOALS[index]);
          const id = slot.existing?._id ?? randomUUID();
          const document: EerrRow = {
            _id: id,
            branchId: slot.branch._id,
            year: slot.year,
            month: slot.month,
            note: DEMO_NOTE,
            structure: storedStructure(structure),
            salesGoal: {
              ...goal,
              value: Types.Decimal128.fromString(goal.value),
              updatedAt: now,
              updatedBy: plan.snapshots.actor._id.toString(),
            },
            revision: (slot.existing?.revision ?? -1) + 1,
            loadStatus: 'CARGADO',
            createdBy: slot.existing?.createdBy ?? plan.snapshots.actor._id,
            createdAt: slot.existing?.createdAt ?? now,
            updatedAt: now,
          };
          if (slot.existing) {
            const replaced = await db
              .collection<EerrRow>('eerr')
              .replaceOne({ _id: id }, document, { session });
            if (replaced.matchedCount !== 1)
              fail('El EERR cambió antes de reemplazarlo');
          } else
            await db
              .collection<EerrRow>('eerr')
              .insertOne(document, { session });
          onWrite?.();
        }
        for (const period of DEMO_PERIODS) {
          const key = periodKey(period.year, period.month);
          const previous = plan.snapshots.templates.find(
            (row) => row._id === key,
          );
          if (templateMatches(previous)) continue;
          await db.collection<TemplateRow>('eerr_templates').replaceOne(
            { _id: key },
            {
              version: (previous?.version ?? 0) + 1,
              gate: previous?.gate ?? 0,
              categories: [...DEMO_CATEGORIES],
            },
            { upsert: true, session },
          );
        }
        for (const definition of [...DEMO_CATEGORIES, ...DEMO_ITEMS]) {
          const kind = DEMO_CATEGORIES.some(
            (row) => row.code === definition.code,
          )
            ? 'CATEGORY'
            : 'ITEM';
          await db
            .collection<ConceptRow>('eerr_concepts')
            .updateOne(
              { _id: definition.code },
              { $setOnInsert: { kind, rootCode: codeRoot(definition.code) } },
              { upsert: true, session },
            );
        }
        const written = await readSnapshot(connection, session, plan.asOf);
        const application: DemoApplication = {
          _id: DEMO_CODE,
          manifestHash: manifestHash(),
          appliedAt: new Date(),
          actorId: plan.snapshots.actor._id.toString(),
          eerrs: plan.slots.map((slot) => {
            const row = written.eerrs.find(
              (candidate) =>
                candidate.branchId.toString() === slot.branch._id.toString() &&
                candidate.year === slot.year &&
                candidate.month === slot.month,
            );
            if (!row) fail('Falta un EERR después de la carga');
            return { slot: slot.name, id: row!._id, documentHash: hash(row) };
          }),
          templates: DEMO_PERIODS.map((period) => {
            const key = periodKey(period.year, period.month);
            const row = written.templates.find(
              (candidate) => candidate._id === key,
            );
            if (!row) fail('Falta una plantilla después de la carga');
            return { key, documentHash: hash(row) };
          }),
          concepts: [...DEMO_CATEGORIES, ...DEMO_ITEMS].map((definition) => {
            const row = written.concepts.find(
              (candidate) => candidate._id === definition.code,
            );
            if (!row) fail('Falta un concepto después de la carga');
            return { code: definition.code, documentHash: hash(row) };
          }),
          createdConceptCodes: [...DEMO_CATEGORIES, ...DEMO_ITEMS]
            .filter(
              (definition) =>
                !plan.snapshots.concepts.some(
                  (row) => row._id === definition.code,
                ),
            )
            .map((definition) => definition.code),
          priorTemplates: plan.snapshots.templates,
        };
        await db
          .collection<DemoApplication>('eerr_demo_applications')
          .insertOne(application, { session });
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return { noOp: false, backup: backupPath };
  } finally {
    await session.endSession();
  }
}

export async function cleanDemo(
  connection: Connection,
  plan: DemoPlan,
  options: { database?: string; planHash?: string; confirm?: string },
  onWrite?: () => void,
) {
  validateConfirm('clean', options, plan);
  if (!allMatched(plan))
    fail(
      'La limpieza exige seis EERR, plantillas y catálogo coincidentes con el manifiesto',
    );
  const backupPath = await backup(plan, 'clean');
  const session = await connection.startSession();
  try {
    await session.withTransaction(
      async () => {
        const current = await makeDemoPlan(
          connection,
          plan.database,
          plan.clusterFingerprint,
          session,
          plan.asOf,
        );
        if (current.hash !== plan.hash)
          fail('Una fuente cambió desde el plan; no se eliminó nada');
        const db = connection.db!;
        const application = plan.snapshots.application!;
        const ids = application.eerrs.map((row) => row.id);
        const deleted = await db
          .collection<EerrRow>('eerr')
          .deleteMany({ _id: { $in: ids } }, { session });
        if (deleted.deletedCount !== 6) fail('La cantidad de EERR cambió');
        onWrite?.();
        await db.collection<TemplateRow>('eerr_templates').deleteMany(
          {
            _id: {
              $in: DEMO_PERIODS.map((period) =>
                periodKey(period.year, period.month),
              ),
            },
          },
          { session },
        );
        if (application.priorTemplates.length)
          await db
            .collection<TemplateRow>('eerr_templates')
            .insertMany(application.priorTemplates, { session });
        // Solo elimina conceptos creados por apply y no compartidos con otros períodos.
        for (const code of application.createdConceptCodes) {
          const used = await db
            .collection<EerrRow>('eerr')
            .findOne(
              { 'structure.nodes.code': code },
              { projection: { _id: 1 }, session },
            );
          const inTemplate = await db
            .collection<TemplateRow>('eerr_templates')
            .findOne(
              { 'categories.code': code },
              { projection: { _id: 1 }, session },
            );
          if (!used && !inTemplate)
            await db
              .collection<ConceptRow>('eerr_concepts')
              .deleteOne({ _id: code }, { session });
        }
        await db
          .collection<DemoApplication>('eerr_demo_applications')
          .deleteOne({ _id: DEMO_CODE }, { session });
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return { backup: backupPath, deleted: 6 };
  } finally {
    await session.endSession();
  }
}

export async function readDemoBackup(path: string) {
  const absolute = resolve(path);
  if (
    !absolute.startsWith(BACKUP_DIR + '\\') &&
    !absolute.startsWith(BACKUP_DIR + '/')
  )
    fail('Backup fuera del directorio controlado');
  const payload = EJSON.parse(
    await readFile(absolute, 'utf8'),
  ) as BackupPayload;
  if (
    payload.format !== 1 ||
    payload.manifest !== DEMO_CODE ||
    !['apply', 'clean'].includes(payload.action) ||
    !Array.isArray(payload.snapshots?.eerrs) ||
    !Array.isArray(payload.snapshots?.templates) ||
    !Array.isArray(payload.snapshots?.concepts) ||
    !('application' in payload.snapshots) ||
    payload.checksum !== hash(payload.snapshots)
  )
    fail('Backup incompatible');
  return payload;
}

/** Recuperación supervisada: nunca restaura sobre un estado modificado tras apply/clean. */
export async function restoreDemoBackup(
  connection: Connection,
  plan: DemoPlan,
  path: string,
  options: { database?: string; planHash?: string; confirm?: string },
) {
  if (
    options.database !== plan.database ||
    options.planHash !== plan.hash ||
    options.confirm !== RESTORE_PHRASE
  )
    fail('Confirmación de restauración incorrecta o plan desactualizado');
  const original = await readDemoBackup(path);
  if (
    original.database !== plan.database ||
    original.clusterFingerprint !== plan.clusterFingerprint
  )
    fail('El backup corresponde a otra base o cluster');
  if (
    stateHash(plan.database, {
      branches: plan.snapshots.branches,
      actor: plan.snapshots.actor,
      foreignCodeUse: plan.snapshots.foreignCodeUse,
      ...original.snapshots,
    }) !== original.planHash
  )
    fail('El backup no coincide con su plan original');
  if (original.action === 'apply' && !allMatched(plan))
    fail(
      'El dataset cambió desde apply; no se puede restaurar automáticamente',
    );
  if (
    original.action === 'clean' &&
    (plan.slots.some((slot) => slot.existing) ||
      plan.snapshots.application ||
      !original.snapshots.application ||
      hash(plan.snapshots.templates) !==
        hash(original.snapshots.application.priorTemplates))
  )
    fail(
      'El estado posterior a clean cambió; no se puede restaurar automáticamente',
    );
  const allowedBranches = new Set(
    plan.snapshots.branches.map((row) => row._id.toString()),
  );
  const validEerr = (row: EerrRow) =>
    allowedBranches.has(row.branchId.toString()) &&
    row.year === 2026 &&
    [8, 9].includes(row.month);
  if (
    original.snapshots.eerrs.length > 6 ||
    !original.snapshots.eerrs.every(validEerr) ||
    original.snapshots.templates.some(
      (row) => !['2026-8', '2026-9'].includes(row._id),
    )
  )
    fail('El backup contiene documentos fuera del alcance');
  const codes = [
    ...DEMO_CATEGORIES.map((row) => row.code),
    ...DEMO_ITEMS.map((row) => row.code),
  ];
  if (original.snapshots.concepts.some((row) => !codes.includes(row._id)))
    fail('El backup contiene conceptos fuera del alcance');
  const session = await connection.startSession();
  try {
    await session.withTransaction(
      async () => {
        const current = await makeDemoPlan(
          connection,
          plan.database,
          plan.clusterFingerprint,
          session,
          plan.asOf,
        );
        if (current.hash !== plan.hash)
          fail('El estado cambió antes de restaurar');
        const db = connection.db!;
        await db.collection<EerrRow>('eerr').deleteMany(
          {
            _id: {
              $in: current.slots.flatMap((slot) =>
                slot.existing ? [slot.existing._id] : [],
              ),
            },
          },
          { session },
        );
        if (original.snapshots.eerrs.length)
          await db
            .collection<EerrRow>('eerr')
            .insertMany(original.snapshots.eerrs, { session });
        await db
          .collection<TemplateRow>('eerr_templates')
          .deleteMany({ _id: { $in: ['2026-8', '2026-9'] } }, { session });
        if (original.snapshots.templates.length)
          await db
            .collection<TemplateRow>('eerr_templates')
            .insertMany(original.snapshots.templates, { session });
        await db
          .collection<DemoApplication>('eerr_demo_applications')
          .deleteOne({ _id: DEMO_CODE }, { session });
        if (original.snapshots.application)
          await db
            .collection<DemoApplication>('eerr_demo_applications')
            .insertOne(original.snapshots.application, { session });
        for (const code of codes) {
          const saved = original.snapshots.concepts.find(
            (row) => row._id === code,
          );
          if (saved)
            await db
              .collection<ConceptRow>('eerr_concepts')
              .updateOne(
                { _id: code },
                { $set: { kind: saved.kind, rootCode: saved.rootCode } },
                { upsert: true, session },
              );
          else {
            const inEerr = await db
              .collection<EerrRow>('eerr')
              .findOne(
                { 'structure.nodes.code': code },
                { projection: { _id: 1 }, session },
              );
            const inTemplate = await db
              .collection<TemplateRow>('eerr_templates')
              .findOne(
                { 'categories.code': code },
                { projection: { _id: 1 }, session },
              );
            if (!inEerr && !inTemplate)
              await db
                .collection<ConceptRow>('eerr_concepts')
                .deleteOne({ _id: code }, { session });
          }
        }
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return { restoredEerrs: original.snapshots.eerrs.length };
  } finally {
    await session.endSession();
  }
}

function parseArgs(args: string[]) {
  const [maybeAction, ...rest] = args;
  const action =
    maybeAction && !maybeAction.startsWith('--') ? maybeAction : 'plan';
  const tokens =
    action === 'plan' && maybeAction?.startsWith('--') ? args : rest;
  if (!['plan', 'apply', 'clean'].includes(action)) fail('Acción desconocida');
  const options: Record<string, string> = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index],
      value = tokens[index + 1];
    if (
      !key?.startsWith('--') ||
      !value ||
      value.startsWith('--') ||
      !['--database', '--plan-hash', '--confirm'].includes(key) ||
      options[key]
    )
      fail('Opciones inválidas');
    options[key] = value;
  }
  if (action === 'plan' && tokens.length)
    fail('plan no acepta opciones de escritura');
  return { action, options };
}

async function main() {
  const { action, options } = parseArgs(process.argv.slice(2));
  if (action === 'plan' && !process.env.MONGODB_URI)
    process.loadEnvFile(API_ENV_FILE);
  const uri = process.env.MONGODB_URI ?? fail('Falta configuración MongoDB');
  let destination: URL;
  try {
    destination = new URL(uri);
  } catch {
    return fail('URI MongoDB inválida');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(destination.protocol))
    fail('Protocolo MongoDB inválido');
  const database = decodeURIComponent(destination.pathname.replace(/^\//, ''));
  if (!database || database.includes('/'))
    fail('La URI debe indicar el nombre exacto de la base');
  const clusterFingerprint = createHash('sha256')
    .update(destination.host)
    .digest('hex')
    .slice(0, 16);
  const connection = await mongoose
    .createConnection(uri, {
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 10000,
    })
    .asPromise();
  try {
    const plan = await makeDemoPlan(connection, database, clusterFingerprint);
    if (action === 'plan')
      console.log(JSON.stringify(publicDemoPlan(plan), null, 2));
    else if (action === 'apply')
      console.log(
        JSON.stringify(
          await applyDemo(connection, plan, {
            database: options['--database'],
            planHash: options['--plan-hash'],
            confirm: options['--confirm'],
          }),
        ),
      );
    else {
      console.log(
        JSON.stringify({
          action: 'clean',
          database,
          targetIds: plan.slots.map((slot) => slot.existing?._id),
          hash: plan.hash,
        }),
      );
      console.log(
        JSON.stringify(
          await cleanDemo(connection, plan, {
            database: options['--database'],
            planHash: options['--plan-hash'],
            confirm: options['--confirm'],
          }),
        ),
      );
    }
  } finally {
    await connection.close();
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/demo-dataset.js')) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof DemoPlanError
        ? error.message
        : 'Falló la operación del dataset; se ocultó el detalle para proteger la configuración.',
    );
    process.exitCode = 1;
  });
}

import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import {
  assertCloneSource,
  cloneSourceCounts,
  prepareCloneNodes,
  loadProgress,
  businessMonthAt,
  type EerrStructure,
} from '@puro-origen/domain';
import type {
  CloneContext,
  ClonePreviewResponse,
  CloneSource,
  StructureResponse,
} from '@puro-origen/shared-types';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { BranchRole } from '../users/user-role.js';
import { BranchesService } from '../branches/branches.service.js';
import { EerrService } from './eerr.service.js';
import { StructureRepository } from './structure.repository.js';
import { EerrClock } from './eerr-clock.js';
import { ClonePreviewToken } from './clone-preview-token.js';
import { publicStructure } from './schemas/structure.schema.js';
import type { ClonePreviewDto, CloneConfirmDto } from './dto/clone.dto.js';
type Viewer = NonNullable<AuthenticatedRequest['user']>;
type Row = NonNullable<Awaited<ReturnType<StructureRepository['get']>>>;
const period = (row: { year: number; month: number }) =>
  row.year * 12 + row.month;
const keyOf = (row: { year: number; month: number }) =>
  `${row.year}-${row.month}`;
const changed = () =>
  new ConflictException(
    'El origen, destino o plantilla cambió. Generá una nueva vista previa; no se escribieron datos.',
  );
@Injectable()
export class CloneService {
  constructor(
    private readonly store: StructureRepository,
    private readonly eerrs: EerrService,
    private readonly branches: BranchesService,
    private readonly clock: EerrClock,
    private readonly tokens: ClonePreviewToken,
  ) {}
  private async access(id: string, viewer: Viewer, write = false) {
    const row = await this.eerrs.get(id, viewer);
    if (
      write &&
      !viewer.isAdmin &&
      !viewer.branchAccesses.some(
        (a) =>
          a.branchId.toLowerCase() === row.branchId &&
          a.role === BranchRole.EDITOR,
      )
    )
      throw new ForbiddenException(
        'Se requiere permiso de Editor en el destino',
      );
    return row;
  }
  private eligible(row: Row) {
    if (
      (row.structure !== null && row.structure !== undefined) ||
      row.note !== undefined ||
      (row.revision ?? 0) !== 0 ||
      row.loadStatus !== 'SIN_CARGAR'
    )
      throw new ConflictException(
        'El destino ya tiene estructura o modificaciones. No se permite reemplazar ni fusionar.',
      );
  }
  private context(
    row: Row,
    branches: { id: string; name: string }[],
  ): CloneContext {
    const branch = branches.find((b) => b.id === row.branchId.toString());
    if (!branch) throw new NotFoundException('EERR no encontrado');
    return {
      id: row._id,
      branchId: branch.id,
      branchName: branch.name,
      year: row.year,
      month: row.month,
    };
  }
  async sources(id: string, viewer: Viewer): Promise<CloneSource[]> {
    const destination = await this.access(id, viewer),
      branches = await this.branches.list(viewer);
    const rows = await this.store.cloneCandidates(
      branches.map((b) => b.id),
      destination.year,
      destination.month,
    );
    const result: CloneSource[] = [];
    for (const row of rows) {
      if (row._id === destination.id || period(row) > period(destination))
        continue;
      try {
        const structure = publicStructure(row.structure);
        if (!structure) continue;
        assertCloneSource(structure);
        const counts = cloneSourceCounts(structure.nodes);
        result.push({
          ...this.context(row, branches),
          loadStatus: loadProgress(structure.nodes).status,
          initialized: true,
          categories: counts.categories,
          items: counts.items,
          loadedAmounts: counts.loadedAmounts,
          sameBranch: row.branchId.toString() === destination.branchId,
          samePeriod: period(row) === period(destination),
        });
      } catch {
        /* Invalid or inaccessible persisted sources are never offered. */
      }
    }
    const rank = (row: CloneSource) =>
      row.sameBranch ? 0 : row.samePeriod ? 1 : 2;
    return result.sort(
      (a, b) =>
        rank(a) - rank(b) || period(b) - period(a) || (a.id < b.id ? -1 : 1),
    );
  }
  private async plan(
    id: string,
    input: ClonePreviewDto,
    viewer: Viewer,
    session?: ClientSession,
  ) {
    await this.access(id, viewer, true);
    await this.access(input.sourceEerrId, viewer);
    const destination = await this.store.get(id.toLowerCase(), session),
      source = await this.store.get(input.sourceEerrId.toLowerCase(), session);
    if (!destination || !source)
      throw new NotFoundException('EERR no encontrado');
    this.eligible(destination);
    if (source._id === destination._id)
      throw new BadRequestException('Origen y destino deben ser distintos');
    if (
      period(source) > period(destination) ||
      period(destination) > period(businessMonthAt(this.clock.now()))
    )
      throw new BadRequestException(
        'No se permiten períodos posteriores al destino ni futuros',
      );
    const branches = await this.branches.list(viewer),
      sourceContext = this.context(source, branches),
      destinationContext = this.context(destination, branches);
    const template = await this.store.existingTemplate(
      keyOf(destination),
      session,
    );
    const issues: string[] = [];
    let structure: EerrStructure | null = null,
      result: ReturnType<typeof prepareCloneNodes> | null = null;
    try {
      if (
        template &&
        (!Number.isSafeInteger(template.version) || template.version < 0)
      )
        throw new Error('Versión de plantilla inválida');
      const candidate = publicStructure(source.structure);
      if (!candidate) throw new Error('El origen no tiene estructura');
      assertCloneSource(candidate);
      structure = candidate;
      result = prepareCloneNodes(
        structure,
        input.mode,
        template?.categories ?? null,
        randomUUID,
      );
      if (
        !template &&
        (
          await this.store.period(destination.year, destination.month, session)
        ).some((row) => row.structure !== null && row.structure !== undefined)
      )
        throw new Error(
          'La plantilla falta en un período con estructuras inicializadas',
        );
    } catch (error) {
      issues.push(
        error instanceof Error &&
          !(error instanceof TypeError) &&
          !(error instanceof RangeError)
          ? error.message
          : 'El origen o la plantilla tiene una estructura persistida inválida',
      );
      result = null;
    }
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          source: {
            id: source._id,
            revision: source.revision ?? 0,
            structure: source.structure,
            branchId: source.branchId,
            year: source.year,
            month: source.month,
          },
          destination: {
            id: destination._id,
            revision: destination.revision ?? 0,
            structure: destination.structure ?? null,
            note: destination.note,
            loadStatus: destination.loadStatus,
          },
          template: template
            ? { version: template.version, categories: template.categories }
            : null,
        }),
      )
      .digest('hex');
    return {
      source,
      destination,
      sourceContext,
      destinationContext,
      template,
      issues,
      result,
      fingerprint,
      counts: cloneSourceCounts(structure?.nodes ?? []),
    };
  }
  async preview(
    id: string,
    input: ClonePreviewDto,
    viewer: Viewer,
  ): Promise<ClonePreviewResponse> {
    const plan = await this.plan(id, input, viewer);
    return {
      source: plan.sourceContext,
      destination: plan.destinationContext,
      mode: input.mode,
      counts: plan.counts,
      destinationCategories:
        plan.result?.categories.length ?? plan.template?.categories.length ?? 0,
      compatible: plan.issues.length === 0,
      issues: plan.issues,
      seedTemplate: !plan.template,
      crossBranchWarning:
        input.mode === 'ESTRUCTURA_Y_VALORES' &&
        plan.sourceContext.branchId !== plan.destinationContext.branchId
          ? 'Estás por copiar valores desde otra sucursal. Los importes y cantidades pueden no representar la operación del destino.'
          : null,
      included:
        input.mode === 'ESTRUCTURA'
          ? [
              'Bloques, categorías, subcategorías e ítems activos',
              'Códigos, jerarquía y orden compatible',
            ]
          : [
              'Estructura e ítems activos',
              'Importes y expresiones persistidos',
              'Cantidades, cero y estado SIN_CARGAR',
            ],
      excluded: [
        'Notas de ítem y nota general',
        'Archivados y metadata de archivo',
        'Actores, timestamps e historial del origen',
        'Cálculos derivados',
      ],
      revisions: {
        source: plan.source.revision ?? 0,
        destination: plan.destination.revision ?? 0,
        template: plan.template?.version ?? null,
      },
      previewToken: plan.issues.length
        ? null
        : this.tokens.sign({
            actor: viewer.sub,
            source: plan.source._id,
            destination: plan.destination._id,
            mode: input.mode,
            sourceRevision: plan.source.revision ?? 0,
            destinationRevision: plan.destination.revision ?? 0,
            fingerprint: plan.fingerprint,
          }),
      expiresAt: new Date(this.clock.now().getTime() + 300000).toISOString(),
    };
  }
  async confirm(
    id: string,
    input: CloneConfirmDto,
    viewer: Viewer,
  ): Promise<StructureResponse> {
    const ticket = this.tokens.verify(input.previewToken);
    if (
      ticket.actor !== viewer.sub ||
      ticket.source !== input.sourceEerrId.toLowerCase() ||
      ticket.destination !== id.toLowerCase() ||
      ticket.mode !== input.mode
    )
      throw changed();
    return this.store.transaction(async (session) => {
      this.tokens.verify(input.previewToken);
      let plan: Awaited<ReturnType<CloneService['plan']>>;
      try {
        plan = await this.plan(id, input, viewer, session);
      } catch (error) {
        // A signed preview already proved access; changes now invalidate that preview.
        if (
          error instanceof NotFoundException ||
          error instanceof ForbiddenException
        )
          throw changed();
        throw error;
      }
      if (
        plan.fingerprint !== ticket.fingerprint ||
        (plan.source.revision ?? 0) !== ticket.sourceRevision ||
        (plan.destination.revision ?? 0) !== ticket.destinationRevision ||
        plan.issues.length ||
        !plan.result
      )
        throw changed();
      if (
        input.mode === 'ESTRUCTURA_Y_VALORES' &&
        plan.sourceContext.branchId !== plan.destinationContext.branchId &&
        input.confirmCrossBranchValues !== true
      )
        throw new BadRequestException(
          'Confirmá explícitamente la copia de valores entre sucursales',
        );
      const locked = await this.store.lockTemplate(
        keyOf(plan.destination),
        session,
      );
      if (!plan.template)
        await this.store.saveTemplate(
          { ...locked!, categories: plan.result.categories },
          session,
        );
      const now = this.clock.now();
      const structure: EerrStructure = {
        schemaVersion: 1,
        structureVersion: plan.template?.version ?? 1,
        initializedAt: now.toISOString(),
        initializedBy: viewer.sub,
        nodes: plan.result.nodes,
      };
      const row = await this.store.initializeClone(
        plan.destination._id,
        structure,
        now,
        session,
      );
      return {
        id: row._id,
        revision: row.revision,
        note: null,
        structure: publicStructure(row.structure),
        progress: loadProgress(structure.nodes),
      };
    });
  }
}

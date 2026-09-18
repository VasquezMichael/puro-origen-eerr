import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  applyCategories,
  assertStructure,
  cleanConceptName,
  emptyAmount,
  initialNodes,
  loadProgress,
  evaluateMoneyExpression,
  normalizeQuantity,
  emptyQuantity,
  normalizeNote,
  NOTE_LIMITS,
  ROOTS,
  type EerrStructure,
  type StructureNode,
} from '@puro-origen/domain';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { BranchRole } from '../users/user-role.js';
import { EerrService } from './eerr.service.js';
import { EerrClock } from './eerr-clock.js';
import { StructureRepository } from './structure.repository.js';
import {
  publicStructure,
  type GlobalPreview,
  type MonthlyTemplate,
} from './schemas/structure.schema.js';
import type {
  AmountDto,
  QuantityDto,
  ItemNoteDto,
  PeriodNoteDto,
  CategoryConfirmDto,
  CategoryPreviewDto,
  ItemDto,
  RenameItemDto,
} from './dto/structure.dto.js';
import type {
  StructureResponse,
  CategoryPreviewResponse,
} from '@puro-origen/shared-types';

type Viewer = NonNullable<AuthenticatedRequest['user']>;
type Row = NonNullable<Awaited<ReturnType<StructureRepository['get']>>>;
const keyOf = (row: { year: number; month: number }) =>
  `${row.year}-${row.month}`;
const revisionsOf = (rows: Row[]) =>
  rows.map((row) => ({ id: row._id, revision: row.revision ?? 0 }));
const conflict = () =>
  new ConflictException(
    'La vista previa o revisión cambió. Recargá y confirmá nuevamente',
  );

@Injectable()
export class StructureService {
  constructor(
    private readonly store: StructureRepository,
    private readonly eerrs: EerrService,
    private readonly clock: EerrClock,
  ) {}
  private async access(id: string, viewer: Viewer, write = false) {
    const row = await this.eerrs.get(id, viewer);
    if (
      write &&
      !viewer.isAdmin &&
      !viewer.branchAccesses.some(
        (access) =>
          access.branchId.toLowerCase() === row.branchId &&
          access.role === BranchRole.EDITOR,
      )
    ) {
      throw new ForbiddenException(
        'Se requiere permiso de Editor en esta sucursal',
      );
    }
    return row;
  }
  private requireRevision(row: Row, expected: number) {
    if ((row.revision ?? 0) !== expected) throw conflict();
  }
  private requireStructure(row: Row): EerrStructure {
    const structure = publicStructure(row.structure);
    if (!structure)
      throw new BadRequestException('Primero prepará la estructura');
    return structure;
  }
  private rule<T>(work: () => T): T {
    try {
      return work();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Estructura inválida',
      );
    }
  }
  private response(row: Row): StructureResponse {
    const structure = publicStructure(row.structure);
    return {
      id: row._id,
      revision: row.revision ?? 0,
      note: row.note ?? null,
      structure,
      progress: loadProgress(structure?.nodes ?? []),
    };
  }
  async get(id: string, viewer: Viewer) {
    await this.access(id, viewer);
    const row = await this.store.get(id.toLowerCase());
    if (!row) throw new NotFoundException('EERR no encontrado');
    return this.response(row);
  }
  async initialize(id: string, expected: number, viewer: Viewer) {
    const accessible = await this.access(id, viewer, true);
    return this.store.transaction(async (session) => {
      // Serializa inicializaciones y publicación global; nunca publica categorías atrasadas.
      const template = await this.store.lockTemplate(
        keyOf(accessible),
        session,
      );
      const row = (await this.store.get(accessible.id, session))!;
      if (row.structure) return this.response(row); // Repetir la misma intención es idempotente.
      this.requireRevision(row, expected);
      const structure: EerrStructure = {
        schemaVersion: 1,
        structureVersion: template!.version,
        initializedAt: this.clock.now().toISOString(),
        initializedBy: viewer.sub,
        nodes: this.rule(() => initialNodes(template!.categories, randomUUID)),
      };
      return this.response(
        await this.store.write(row._id, expected, structure, session, true),
      );
    });
  }
  async createItem(id: string, input: ItemDto, viewer: Viewer) {
    const accessible = await this.access(id, viewer, true);
    return this.store.transaction(async (session) => {
      const row = (await this.store.get(accessible.id, session))!;
      this.requireRevision(row, input.expectedRevision);
      const structure = this.requireStructure(row);
      const parent = structure.nodes.find(
        (node) => node.nodeId === input.parentId.toLowerCase(),
      );
      if (!parent || parent.kind === 'ITEM')
        throw new BadRequestException('Padre inexistente o no permitido');
      const code = randomUUID();
      structure.nodes.push({
        kind: 'ITEM',
        code,
        nodeId: randomUUID(),
        parentId: parent.nodeId,
        name: this.rule(() => cleanConceptName(input.name)),
        position:
          Math.max(
            -1,
            ...structure.nodes
              .filter((node) => node.parentId === parent.nodeId)
              .map((node) => node.position),
          ) + 1,
        amount: emptyAmount(),
        quantityEnabled: input.quantityEnabled ?? false,
        unit:
          input.unit === undefined
            ? null
            : this.rule(() => cleanConceptName(input.unit!)),
      });
      this.rule(() => assertStructure(structure.nodes));
      await this.store.addConcept(
        {
          _id: code,
          kind: 'ITEM',
          rootCode: this.rootCode(parent, structure.nodes),
        },
        session,
      );
      structure.structureVersion += 1;
      return this.response(
        await this.store.write(
          row._id,
          input.expectedRevision,
          structure,
          session,
        ),
      );
    });
  }
  private rootCode(node: StructureNode, nodes: StructureNode[]) {
    while (node.parentId !== null)
      node = nodes.find((parent) => parent.nodeId === node.parentId)!;
    return node.code;
  }
  private async editItem(
    id: string,
    nodeId: string,
    expected: number,
    viewer: Viewer,
    edit: (node: StructureNode, structure: EerrStructure) => void,
  ) {
    const accessible = await this.access(id, viewer, true);
    const row = (await this.store.get(accessible.id))!;
    this.requireRevision(row, expected);
    const structure = this.requireStructure(row);
    const node = structure.nodes.find(
      (item) => item.nodeId === nodeId.toLowerCase(),
    );
    if (!node || node.kind !== 'ITEM')
      throw new BadRequestException('El nodo no es un ítem de este EERR');
    this.rule(() => {
      edit(node, structure);
      assertStructure(structure.nodes);
    });
    return this.response(await this.store.write(row._id, expected, structure));
  }
  renameItem(id: string, nodeId: string, input: RenameItemDto, viewer: Viewer) {
    return this.editItem(
      id,
      nodeId,
      input.expectedRevision,
      viewer,
      (node, structure) => {
        node.name = cleanConceptName(input.name);
        structure.structureVersion += 1;
      },
    );
  }
  amount(id: string, nodeId: string, input: AmountDto, viewer: Viewer) {
    if (input.state === 'SIN_CARGAR' && input.input !== undefined)
      throw new BadRequestException('SIN_CARGAR no admite entrada');
    return this.editItem(id, nodeId, input.expectedRevision, viewer, (node) => {
      node.amount =
        input.state === 'SIN_CARGAR'
          ? emptyAmount()
          : {
              state: 'CARGADO',
              ...evaluateMoneyExpression(input.input!),
              currency: 'ARS',
              scale: 2,
            };
    });
  }
  quantity(id: string, nodeId: string, input: QuantityDto, viewer: Viewer) {
    if (input.state === 'SIN_CARGAR' && input.input !== undefined)
      throw new BadRequestException('SIN_CARGAR no admite entrada');
    return this.editItem(id, nodeId, input.expectedRevision, viewer, (node) => {
      node.quantity =
        input.state === 'SIN_CARGAR'
          ? emptyQuantity()
          : { state: 'CARGADO', value: normalizeQuantity(input.input!) };
    });
  }
  itemNote(id: string, nodeId: string, input: ItemNoteDto, viewer: Viewer) {
    return this.editItem(id, nodeId, input.expectedRevision, viewer, (node) => {
      const note = normalizeNote(input.note, NOTE_LIMITS.item);
      if (note === null) delete node.note;
      else node.note = note;
    });
  }
  async periodNote(id: string, input: PeriodNoteDto, viewer: Viewer) {
    const accessible = await this.access(id, viewer, true);
    const note = this.rule(() => normalizeNote(input.note, NOTE_LIMITS.period));
    return this.response(
      await this.store.writeNote(accessible.id, input.expectedRevision, note),
    );
  }
  private updatedCategories(
    template: MonthlyTemplate,
    change: Pick<GlobalPreview, 'operation' | 'code' | 'parentCode' | 'name'>,
  ) {
    const categories = structuredClone(template.categories);
    if (change.operation === 'CREATE') {
      if (
        !ROOTS.some((root) => root.code === change.parentCode) &&
        !categories.some((category) => category.code === change.parentCode)
      )
        throw new BadRequestException('Padre global inexistente');
      categories.push({
        code: change.code,
        parentCode: change.parentCode,
        name: change.name,
        position:
          Math.max(
            -1,
            ...categories
              .filter((category) => category.parentCode === change.parentCode)
              .map((category) => category.position),
          ) + 1,
      });
    } else {
      const category = categories.find((item) => item.code === change.code);
      if (!category)
        throw new BadRequestException(
          'Categoría global inexistente o bloque protegido',
        );
      category.name = change.name;
    }
    this.rule(() => initialNodes(categories, randomUUID));
    return categories;
  }
  async preview(
    id: string,
    input: CategoryPreviewDto,
    viewer: Viewer,
  ): Promise<CategoryPreviewResponse> {
    const accessible = await this.access(id, viewer, true);
    if (
      (input.operation === 'CREATE' && input.code !== undefined) ||
      (input.operation === 'RENAME' && input.parentCode !== undefined)
    )
      throw new BadRequestException('Campos incompatibles con la operación');
    const rows = await this.store.period(accessible.year, accessible.month);
    const own = rows.find((row) => row._id === accessible.id)!;
    this.requireRevision(own, input.expectedRevision);
    const template = await this.store.template(keyOf(accessible));
    const existing = template.categories.find(
      (category) => category.code === input.code?.toLowerCase(),
    );
    const preview: GlobalPreview = {
      _id: randomUUID(),
      userId: viewer.sub,
      eerrId: accessible.id,
      year: accessible.year,
      month: accessible.month,
      expiresAt: new Date(this.clock.now().getTime() + 5 * 60_000),
      operation: input.operation,
      name: this.rule(() => cleanConceptName(input.name)),
      parentCode:
        input.operation === 'CREATE'
          ? input.parentCode!.toLowerCase()
          : (existing?.parentCode ?? ''),
      code:
        input.operation === 'CREATE' ? randomUUID() : input.code!.toLowerCase(),
      templateVersion: template.version,
      revisions: revisionsOf(rows),
    };
    const categories = this.updatedCategories(template, preview);
    this.validatePublication(rows, categories);
    await this.store.savePreview(preview);
    const parent =
      ROOTS.find((root) => root.code === preview.parentCode) ??
      template.categories.find(
        (category) => category.code === preview.parentCode,
      );
    return {
      previewId: preview._id,
      operation: preview.operation,
      name: preview.name,
      parent: { code: preview.parentCode, name: parent!.name },
      year: preview.year,
      month: preview.month,
      expiresAt: preview.expiresAt.toISOString(),
      affected: rows.length,
      initialized: rows.filter((row) => row.structure).length,
      uninitialized: rows.filter((row) => !row.structure).length,
      warning:
        'Cambio global: afecta las categorías de todas las sucursales de este año y mes. No modifica importes.',
    };
  }
  private validatePublication(
    rows: Row[],
    categories: MonthlyTemplate['categories'],
  ) {
    // Mensaje común: no revelar nombres locales, ítems o sucursales ajenas.
    try {
      for (const row of rows) {
        const structure = publicStructure(row.structure);
        if (structure) applyCategories(structure.nodes, categories, randomUUID);
      }
    } catch {
      throw new ConflictException(
        'La publicación entra en conflicto con una estructura del período. Se requiere revisión antes de confirmar',
      );
    }
  }
  async confirm(id: string, input: CategoryConfirmDto, viewer: Viewer) {
    const accessible = await this.access(id, viewer, true);
    return this.store.transaction(async (session) => {
      await this.store.lockTemplate(keyOf(accessible), session);
      const preview = await this.store.preview(
        input.previewId.toLowerCase(),
        session,
      );
      if (
        !preview ||
        preview.userId !== viewer.sub ||
        preview.eerrId !== accessible.id ||
        preview.year !== accessible.year ||
        preview.month !== accessible.month ||
        preview.expiresAt.getTime() <= this.clock.now().getTime()
      )
        throw conflict();
      const rows = await this.store.period(
        preview.year,
        preview.month,
        session,
      );
      const own = rows.find((row) => row._id === accessible.id)!;
      this.requireRevision(own, input.expectedRevision);
      const template = await this.store.template(keyOf(accessible), session);
      if (
        template.version !== preview.templateVersion ||
        JSON.stringify(revisionsOf(rows)) !== JSON.stringify(preview.revisions)
      )
        throw conflict();
      const categories = this.updatedCategories(template, preview);
      this.validatePublication(rows, categories);
      if (preview.operation === 'CREATE') {
        const templateNodes = initialNodes(categories, randomUUID);
        await this.store.addConcept(
          {
            _id: preview.code,
            kind: 'CATEGORY',
            rootCode: this.rootCode(
              templateNodes.find((node) => node.code === preview.code)!,
              templateNodes,
            ),
          },
          session,
        );
      }
      await this.store.saveTemplate({ ...template, categories }, session);
      let result = own;
      for (const row of rows) {
        const structure = publicStructure(row.structure);
        if (!structure) continue;
        structure.nodes = applyCategories(
          structure.nodes,
          categories,
          randomUUID,
        );
        structure.structureVersion += 1;
        const updated = await this.store.write(
          row._id,
          row.revision ?? 0,
          structure,
          session,
        );
        if (row._id === own._id) result = updated;
      }
      await this.store.consumePreview(preview._id, session);
      return this.response(result);
    });
  }
}

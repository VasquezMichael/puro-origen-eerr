import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  ConflictException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import {
  importPlan,
  importStructureIdentity,
  loadProgress,
} from '@puro-origen/domain';
import type {
  ImportPreviewResponse,
  ImportConfirmResponse,
} from '@puro-origen/shared-types';
import type { AuthenticatedRequest } from '../../auth/auth.guard.js';
import { BranchRole } from '../../users/user-role.js';
import { BranchesService } from '../../branches/branches.service.js';
import { EerrService } from '../eerr.service.js';
import { EerrClock } from '../eerr-clock.js';
import { StructureRepository } from '../structure.repository.js';
import { publicStructure } from '../schemas/structure.schema.js';
import {
  ImportToken,
  importConflict,
  IMPORT_PREVIEW_MS,
  type TemplateTicket,
  type PreviewTicket,
} from './import-token.js';
import {
  createImportTemplate,
  readImportFile,
  type ImportFile,
} from './import-file.js';
type Viewer = NonNullable<AuthenticatedRequest['user']>;
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
@Injectable()
export class ImportService {
  constructor(
    private readonly store: StructureRepository,
    private readonly eerrs: EerrService,
    private readonly branches: BranchesService,
    private readonly clock: EerrClock,
    private readonly tokens: ImportToken,
  ) {}
  private async current(
    id: string,
    viewer: Viewer,
    write: boolean,
    session?: ClientSession,
  ) {
    const accessible = await this.eerrs.get(id, viewer);
    if (
      write &&
      !viewer.isAdmin &&
      !viewer.branchAccesses.some(
        (a) =>
          a.branchId.toLowerCase() === accessible.branchId &&
          a.role === BranchRole.EDITOR,
      )
    )
      throw new ForbiddenException(
        'Se requiere permiso de Editor para importar',
      );
    const row = await this.store.get(accessible.id, session);
    if (!row) throw new NotFoundException('EERR no encontrado');
    try {
      const structure = publicStructure(row.structure);
      if (!structure)
        throw new BadRequestException(
          'Primero inicializá la estructura del EERR',
        );
      const identity = hash(importStructureIdentity(structure));
      return { row, structure, identity };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(
        'La estructura persistida es incompatible; requiere revisión.',
      );
    }
  }
  async template(id: string, format: 'csv' | 'xlsx', viewer: Viewer) {
    const { row, structure, identity } = await this.current(id, viewer, false);
    const branch = (await this.branches.list(viewer)).find(
      (b) => b.id === row.branchId.toString(),
    );
    if (!branch) throw new NotFoundException('EERR no encontrado');
    const stamp = this.tokens.sign({
      kind: 'template',
      id: row._id,
      identity,
      version: structure.structureVersion,
    });
    return createImportTemplate(format, {
      id: row._id,
      branchName: branch.name,
      year: row.year,
      month: row.month,
      revision: structure.structureVersion,
      stamp,
      structure,
    });
  }
  private plan(
    current: Awaited<ReturnType<ImportService['current']>>,
    file: Awaited<ReturnType<typeof readImportFile>>,
  ) {
    if (file.id !== current.row._id)
      throw new BadRequestException('El archivo corresponde a otro EERR');
    const ticket = this.tokens.verify<TemplateTicket>(file.stamp, 'template');
    if (ticket.id !== current.row._id || ticket.identity !== current.identity)
      throw new ConflictException(
        'La plantilla está desactualizada. Descargá una plantilla nueva.',
      );
    return importPlan(current.structure, file.rows);
  }
  async preview(
    id: string,
    file: ImportFile,
    viewer: Viewer,
  ): Promise<ImportPreviewResponse> {
    const current = await this.current(id, viewer, true),
      parsed = await readImportFile(file),
      plan = this.plan(current, parsed);
    const branch = (await this.branches.list(viewer)).find(
      (b) => b.id === current.row.branchId.toString(),
    );
    if (!branch) throw new NotFoundException('EERR no encontrado');
    const expires = this.clock.now().getTime() + IMPORT_PREVIEW_MS;
    const { changes, ...summary } = plan;
    return {
      ...summary,
      destination: {
        id: current.row._id,
        branchId: branch.id,
        branchName: branch.name,
        year: current.row.year,
        month: current.row.month,
      },
      fileName: Array.from(file.originalname, (char) =>
        char.charCodeAt(0) < 32 || char === '/' || char === '\\' ? '_' : char,
      )
        .join('')
        .slice(0, 180),
      format: parsed.format,
      warnings: [
        'Solo se modifican importes y cantidades de ítems activos. Las notas y la estructura se conservan.',
        ...(changes.length
          ? []
          : ['No hay campos que cambiar. No se realizará ninguna escritura.']),
      ],
      revision: current.row.revision ?? 0,
      structuralRevision: current.structure.structureVersion,
      expiresAt: new Date(expires).toISOString(),
      previewToken:
        plan.issues.length || !changes.length
          ? null
          : this.tokens.sign({
              kind: 'preview',
              id: current.row._id,
              actor: viewer.sub,
              identity: current.identity,
              revision: current.row.revision ?? 0,
              digest: hash(file.buffer),
              planDigest: hash(JSON.stringify(changes)),
              expires,
            }),
    };
  }
  async confirm(
    id: string,
    file: ImportFile,
    previewToken: string,
    viewer: Viewer,
  ): Promise<ImportConfirmResponse> {
    const ticket = this.tokens.verify<PreviewTicket>(previewToken, 'preview');
    if (
      ticket.id !== id.toLowerCase() ||
      ticket.actor !== viewer.sub ||
      !file?.buffer ||
      ticket.digest !== hash(file.buffer)
    )
      throw importConflict();
    await this.current(id, viewer, true);
    const parsed = await readImportFile(file);
    return this.store.transaction(async (session) => {
      this.tokens.verify<PreviewTicket>(previewToken, 'preview');
      const current = await this.current(id, viewer, true, session);
      if (
        (current.row.revision ?? 0) !== ticket.revision ||
        current.identity !== ticket.identity
      )
        throw importConflict();
      const plan = this.plan(current, parsed);
      if (
        plan.issues.length ||
        !plan.changes.length ||
        hash(JSON.stringify(plan.changes)) !== ticket.planDigest
      )
        throw importConflict();
      const updated = await this.store.writeImport(
        current.row._id,
        ticket.revision,
        current.structure,
        plan.changes,
        this.clock.now(),
        session,
      );
      const structure = publicStructure(updated.structure);
      return {
        result: {
          id: updated._id,
          revision: updated.revision ?? 0,
          note: updated.note ?? null,
          structure,
          progress: loadProgress(structure!.nodes),
        },
        affectedItems: plan.affectedItems,
        changedFields: plan.changedFields,
      };
    });
  }
}

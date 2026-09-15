import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model, ClientSession } from 'mongoose';
import {
  loadProgress,
  STRUCTURE_LIMITS,
  type EerrStructure,
} from '@puro-origen/domain';
import { Eerr, type EerrDocument } from './schemas/eerr.schema.js';
import {
  ConceptSchema,
  PreviewSchema,
  TemplateSchema,
  storedStructure,
  type Concept,
  type GlobalPreview,
  type MonthlyTemplate,
} from './schemas/structure.schema.js';

export const revisionFilter = (revision: number) =>
  revision === 0
    ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
    : { revision };

@Injectable()
export class StructureRepository {
  constructor(
    @InjectModel(Eerr.name) private readonly eerrs: Model<EerrDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}
  // Registro perezoso: las pruebas unitarias no abren conexiones ni requieren modelos adicionales.
  private templates() {
    return this.connection.model<MonthlyTemplate>(
      'EerrTemplate',
      TemplateSchema,
    );
  }
  private previews() {
    return this.connection.model<GlobalPreview>('EerrPreview', PreviewSchema);
  }
  private concepts() {
    return this.connection.model<Concept>('EerrConcept', ConceptSchema);
  }
  async transaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.connection.transaction(work, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === 20 || error.code === 263)
          throw new ServiceUnavailableException(
            'La operación requiere MongoDB con transacciones; no se aplicaron cambios parciales',
          );
        if (error.code === 11000 || error.code === 112)
          throw new ConflictException(
            'Cambió la estructura; recargá y revisá la operación',
          );
      }
      throw error;
    }
  }
  get(id: string, session?: ClientSession) {
    return this.eerrs
      .findById(id)
      .session(session ?? null)
      .lean()
      .exec();
  }
  async period(year: number, month: number, session?: ClientSession) {
    const rows = await this.eerrs
      .find({ year, month })
      .sort({ _id: 1 })
      .limit(STRUCTURE_LIMITS.periodEerrs + 1)
      .session(session ?? null)
      .lean()
      .exec();
    if (rows.length > STRUCTURE_LIMITS.periodEerrs)
      throw new ConflictException(
        'El período supera el límite de publicación coordinada; requiere revisión técnica',
      );
    return rows;
  }
  async template(key: string, session?: ClientSession) {
    return (
      (await this.templates()
        .findById(key)
        .session(session ?? null)
        .lean()
        .exec()) ?? { _id: key, version: 0, gate: 0, categories: [] }
    );
  }
  async lockTemplate(key: string, session: ClientSession) {
    return this.templates()
      .findOneAndUpdate(
        { _id: key },
        { $inc: { gate: 1 }, $setOnInsert: { version: 0, categories: [] } },
        { upsert: true, returnDocument: 'after', session },
      )
      .lean()
      .exec();
  }
  async saveTemplate(template: MonthlyTemplate, session: ClientSession) {
    const result = await this.templates().updateOne(
      { _id: template._id, version: template.version },
      { $set: { categories: template.categories }, $inc: { version: 1 } },
      { session, runValidators: true },
    );
    if (result.modifiedCount !== 1)
      throw new ConflictException('La plantilla cambió');
  }
  async write(
    id: string,
    revision: number,
    structure: EerrStructure,
    session?: ClientSession,
    initialize = false,
  ) {
    const row = await this.eerrs
      .findOneAndUpdate(
        { _id: id, ...revisionFilter(revision) },
        {
          $set: {
            structure: storedStructure(structure),
            loadStatus: loadProgress(structure.nodes).status,
          },
          $inc: { revision: 1 },
        },
        {
          returnDocument: 'after',
          runValidators: true,
          session,
          timestamps: !initialize,
        },
      )
      .lean()
      .exec();
    if (!row)
      throw new ConflictException(
        'El EERR cambió. Conservá tu borrador y recargá antes de guardar',
      );
    return row;
  }
  async addConcept(concept: Concept, session: ClientSession) {
    await this.concepts().create([concept], { session });
  }
  async savePreview(preview: GlobalPreview) {
    await this.previews().create(preview);
  }
  preview(id: string, session?: ClientSession) {
    return this.previews()
      .findById(id)
      .session(session ?? null)
      .lean()
      .exec();
  }
  async consumePreview(id: string, session: ClientSession) {
    const result = await this.previews().deleteOne({ _id: id }, { session });
    if (result.deletedCount !== 1)
      throw new ConflictException('La vista previa ya fue utilizada');
  }
}

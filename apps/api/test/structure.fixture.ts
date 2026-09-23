import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mongo, Types } from 'mongoose';
import {
  loadProgress,
  type EerrStructure,
  type StructureNode,
} from '@puro-origen/domain';
import {
  storedStructure,
  type Concept,
  type GlobalPreview,
  type MonthlyTemplate,
} from '../src/eerr/schemas/structure.schema.js';
import type { StructureRepository } from '../src/eerr/structure.repository.js';

type Row = NonNullable<Awaited<ReturnType<StructureRepository['get']>>>;
const copy = <T>(value: T): T =>
  mongo.BSON.EJSON.parse(mongo.BSON.EJSON.stringify(value)) as T;
export const fixtureBranch = '123456789012345678901234';
export const fixtureOtherBranch = 'abcdefabcdefabcdefabcdef';
export const fixtureUser = '222222222222222222222222';
export const fixtureNow = new Date('2026-09-15T12:00:00Z');

/** Dobles deterministas: CAS y rollback; no sustituyen integración MongoDB. */
export class MemoryStructureRepository {
  state: {
    rows: Row[];
    templates: Record<string, MonthlyTemplate>;
    previews: Record<string, GlobalPreview>;
    concepts: Concept[];
  } = { rows: [], templates: {}, previews: {}, concepts: [] };
  failWrite = 0;
  writes = 0;
  private queue = Promise.resolve();
  seed(branchId = fixtureBranch, month = 9, year = 2026) {
    const row = {
      _id: randomUUID(),
      branchId: new Types.ObjectId(branchId),
      year,
      month,
      createdBy: new Types.ObjectId(fixtureUser),
      createdAt: new Date(fixtureNow),
      updatedAt: new Date(fixtureNow),
      loadStatus: 'SIN_CARGAR',
    } as Row;
    this.state.rows.push(row);
    return row;
  }
  async transaction<T>(work: (session: unknown) => Promise<T>) {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = copy(this.state);
    try {
      return await work({ offline: true });
    } catch (error) {
      this.state = before;
      throw error;
    } finally {
      release();
    }
  }
  async get(id: string) {
    return copy(this.state.rows.find((row) => row._id === id) ?? null);
  }
  async period(year: number, month: number) {
    return copy(
      this.state.rows
        .filter((row) => row.year === year && row.month === month)
        .sort((a, b) => a._id.localeCompare(b._id)),
    );
  }
  async existingTemplate(key: string) {
    return copy(this.state.templates[key] ?? null);
  }
  async cloneCandidates(branchIds: string[], year: number, month: number) {
    return copy(
      this.state.rows.filter(
        (row) =>
          branchIds.includes(row.branchId.toString()) &&
          row.structure &&
          row.year * 12 + row.month <= year * 12 + month,
      ),
    );
  }
  async initializeClone(
    id: string,
    structure: EerrStructure,
    now: Date,
    session?: unknown,
  ) {
    const row = this.state.rows.find((r) => r._id === id);
    if (
      !row ||
      row.structure != null ||
      row.note !== undefined ||
      (row.revision ?? 0) !== 0 ||
      row.loadStatus !== 'SIN_CARGAR'
    )
      throw new ConflictException('Destino no elegible');
    const result = await this.write(id, 0, structure, session);
    row.updatedAt = now;
    return { ...result, updatedAt: now };
  }
  async template(key: string) {
    return copy(
      this.state.templates[key] ?? {
        _id: key,
        version: 0,
        gate: 0,
        categories: [],
      },
    );
  }
  async lockTemplate(key: string) {
    this.state.templates[key] ??= {
      _id: key,
      version: 0,
      gate: 0,
      categories: [],
    };
    this.state.templates[key].gate++;
    return copy(this.state.templates[key]);
  }
  async saveTemplate(template: MonthlyTemplate) {
    this.state.templates[template._id] = copy({
      ...template,
      version: template.version + 1,
    });
  }
  async write(
    id: string,
    revision: number,
    structure: EerrStructure,
    _session?: unknown,
    initialize = false,
  ) {
    this.writes++;
    if (this.failWrite && this.writes === this.failWrite)
      throw new Error('Fallo simulado durante transacción');
    const row = this.state.rows.find((row) => row._id === id);
    if (!row || (row.revision ?? 0) !== revision)
      throw new ConflictException('Revisión conflictiva');
    row.structure = storedStructure(structure);
    row.revision = revision + 1;
    row.loadStatus = loadProgress(structure.nodes).status as Row['loadStatus'];
    if (!initialize) row.updatedAt = new Date('2026-09-15T13:00:00Z');
    return copy(row);
  }
  async writeOrder(id: string, revision: number, nodes: StructureNode[]) {
    this.writes++;
    if (this.failWrite && this.writes === this.failWrite)
      throw new Error('Fallo simulado durante transacción');
    const row = this.state.rows.find((row) => row._id === id);
    if (!row?.structure || (row.revision ?? 0) !== revision)
      throw new ConflictException('Revisión conflictiva');
    for (const node of row.structure.nodes) {
      const next = nodes.find((next) => next.nodeId === node.nodeId)!;
      node.parentId = next.parentId;
      node.position = next.position;
    }
    row.structure.structureVersion++;
    row.revision = revision + 1;
    row.updatedAt = new Date('2026-09-15T13:00:00Z');
    return copy(row);
  }
  async addConcept(concept: Concept) {
    this.state.concepts.push(copy(concept));
  }
  async writeArchive(
    id: string,
    revision: number,
    nodeId: string,
    archive: NonNullable<EerrStructure['nodes'][number]['archive']>,
    loadStatus: Row['loadStatus'],
    nodes?: StructureNode[],
  ) {
    const row = this.state.rows.find((r) => r._id === id);
    const node = row?.structure?.nodes.find(
      (n) => n.nodeId === nodeId && n.kind === 'ITEM',
    );
    if (!row || !node || (row.revision ?? 0) !== revision)
      throw new ConflictException('Revisión conflictiva');
    node.archive = copy(archive);
    if (nodes)
      for (const stored of row.structure!.nodes)
        stored.position = nodes.find(
          (n) => n.nodeId === stored.nodeId,
        )!.position;
    row.revision = revision + 1;
    row.loadStatus = loadStatus;
    this.writes++;
    return copy(row);
  }
  async writeNote(id: string, revision: number, note: string | null) {
    const row = this.state.rows.find((row) => row._id === id);
    if (!row || (row.revision ?? 0) !== revision)
      throw new ConflictException('Revisión conflictiva');
    this.writes++;
    if (note === null) delete row.note;
    else row.note = note;
    row.revision = revision + 1;
    row.updatedAt = new Date('2026-09-15T13:00:00Z');
    return copy(row);
  }
  async savePreview(preview: GlobalPreview) {
    this.state.previews[preview._id] = copy(preview);
  }
  async preview(id: string) {
    return copy(this.state.previews[id] ?? null);
  }
  async consumePreview(id: string) {
    delete this.state.previews[id];
  }
}

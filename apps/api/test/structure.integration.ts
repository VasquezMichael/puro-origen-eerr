import { CompletePendingService } from '../src/eerr/complete-pending.service.js';
import { AnalysisService } from '../src/eerr/analysis.service.js';
import { SalesGoalService } from '../src/eerr/sales-goal.service.js';
import { completePendingPlan } from '@puro-origen/domain';
import { ImportService } from '../src/eerr/import/import.service.js';
import { ImportToken } from '../src/eerr/import/import-token.js';
import { readCsv, csvEscape } from '../src/eerr/import/csv.js';
import { importPlan } from '@puro-origen/domain';
import { ConfigService } from '@nestjs/config';
import ExcelJS from '@protobi/exceljs';
import { CloneService } from '../src/eerr/clone.service.js';
import { ClonePreviewToken } from '../src/eerr/clone-preview-token.js';
import 'reflect-metadata';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createConnection, type Connection, type Model } from 'mongoose';
import { ROOTS } from '@puro-origen/domain';
import {
  Eerr,
  EerrSchema,
  type EerrDocument,
} from '../src/eerr/schemas/eerr.schema.js';
import { StructureRepository } from '../src/eerr/structure.repository.js';
import { StructureService } from '../src/eerr/structure.service.js';
import { EerrService } from '../src/eerr/eerr.service.js';
import {
  ConceptSchema,
  PreviewSchema,
  TemplateSchema,
} from '../src/eerr/schemas/structure.schema.js';
import type { BranchesService } from '../src/branches/branches.service.js';

// No acepta URI: únicamente lanza su propio mongod temporal, sin AppModule ni configuración real.
describe('EP-04A en replica set MongoDB efímero y local', () => {
  let process: ChildProcess | undefined;
  let directory: string;
  let connection: Connection | undefined;
  let model: Model<Eerr>;
  let repository: StructureRepository;
  let service: StructureService;
  let clones: CloneService;
  let imports: ImportService;
  let completePending: CompletePendingService;
  let analysis: AnalysisService;
  let salesGoals: SalesGoalService;
  let id: string;
  const viewer = {
    sub: '222222222222222222222222',
    isAdmin: true,
    branchAccesses: [],
  };
  const clock = { now: () => new Date('2026-09-15T12:00:00Z') };
  beforeAll(async () => {
    const binary = globalThis.process.env.MONGOD_BINARY;
    if (!binary || !isAbsolute(binary))
      throw new Error(
        'MONGOD_BINARY debe indicar un ejecutable local absoluto; no se utiliza ninguna URI externa',
      );
    directory = await mkdtemp(join(tmpdir(), 'puro-eerr-integration-'));
    await mkdir(join(directory, 'data'));
    const port = await new Promise<number>((resolvePort) => {
      const listener = createServer();
      listener.listen(0, '127.0.0.1', () => {
        const address = listener.address();
        if (typeof address !== 'object' || !address)
          throw new Error('Puerto inválido');
        listener.close(() => resolvePort(address.port));
      });
    });
    const replica = `ep04-${randomUUID()}`;
    process = spawn(
      binary,
      [
        '--bind_ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--dbpath',
        join(directory, 'data'),
        '--replSet',
        replica,
        '--logpath',
        join(directory, 'mongod.log'),
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    let launchError: Error | undefined;
    process.on('error', (error) => {
      launchError = error;
    });
    const uri = `mongodb://127.0.0.1:${port}/ep04_test?directConnection=true`;
    let lastConnectionError: unknown;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (launchError) throw launchError;
      const candidate = createConnection(uri, {
        serverSelectionTimeoutMS: 500,
      });
      try {
        connection = await candidate.asPromise();
        break;
      } catch (error) {
        lastConnectionError = error;
        await candidate.close().catch(() => undefined);
      }
    }
    if (!connection)
      throw new Error('No inició MongoDB local', {
        cause: lastConnectionError,
      });
    await connection.db!.admin().command({
      replSetInitiate: {
        _id: replica,
        members: [{ _id: 0, host: `127.0.0.1:${port}` }],
      },
    });
    let primary = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (
        (await connection.db!.admin().command({ hello: 1 })).isWritablePrimary
      ) {
        primary = true;
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    if (!primary) throw new Error('El replica set local no eligió primario');
    model = connection.model<Eerr>(Eerr.name, EerrSchema);
    await model.init();
    await connection.model('EerrTemplate', TemplateSchema).init();
    await connection.model('EerrConcept', ConceptSchema).init();
    await connection.model('EerrPreview', PreviewSchema).init();
    repository = new StructureRepository(
      model as unknown as Model<EerrDocument>,
      connection,
    );
    const branches = {
      list: async () => [
        { id: '123456789012345678901234', name: 'Central', active: false },
        { id: 'abcdefabcdefabcdefabcdef', name: 'Otra', active: false },
      ],
    } as unknown as BranchesService;
    service = new StructureService(
      repository,
      new EerrService(model as unknown as Model<EerrDocument>, branches, clock),
      clock,
    );
    analysis = new AnalysisService(
      new EerrService(model as unknown as Model<EerrDocument>, branches, clock),
    );
    salesGoals = new SalesGoalService(
      model as unknown as Model<EerrDocument>,
      new EerrService(model as unknown as Model<EerrDocument>, branches, clock),
      clock,
    );
    imports = new ImportService(
      repository,
      new EerrService(model as unknown as Model<EerrDocument>, branches, clock),
      branches,
      clock,
      new ImportToken(
        new ConfigService({
          JWT_SECRET: 'test-only-not-real-secret-0000000000000000',
        }),
        clock,
      ),
    );
    completePending = new CompletePendingService(
      repository,
      new EerrService(model as unknown as Model<EerrDocument>, branches, clock),
      branches,
      clock,
      new ImportToken(
        new ConfigService({
          JWT_SECRET: 'test-only-not-real-secret-0000000000000000',
        }),
        clock,
      ),
    );
    clones = new CloneService(
      repository,
      new EerrService(model as unknown as Model<EerrDocument>, branches, clock),
      branches,
      clock,
      new ClonePreviewToken(
        new ConfigService({
          JWT_SECRET: 'test-only-not-real-secret-0000000000000000',
        }),
        clock,
      ),
    );
  });
  afterAll(async () => {
    await connection?.close();
    if (process && process.exitCode === null) {
      const exited = new Promise<void>((resolveExit) =>
        process!.once('exit', () => resolveExit()),
      );
      process.kill();
      await exited;
    }
    if (directory) {
      const target = resolve(directory);
      const root = resolve(tmpdir());
      if (
        target.startsWith(root + '\\puro-eerr-integration-') ||
        target.startsWith(root + '/puro-eerr-integration-')
      )
        await rm(target, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200,
        });
      else throw new Error('Directorio temporal fuera del ámbito esperado');
    }
  });
  beforeEach(async () => {
    // Solo las colecciones del servidor que esta prueba acaba de crear.
    for (const collection of Object.values(connection!.collections))
      await collection.deleteMany({});
    const created = await model.create({
      branchId: '123456789012345678901234',
      year: 2026,
      month: 9,
      createdBy: viewer.sub,
    });
    id = created._id;
  });
  it('inicializa un documento legado sin alterar timestamps y guarda Decimal128 con CAS real', async () => {
    await connection!
      .db!.collection<{ _id: string }>('eerr')
      .updateOne({ _id: id }, { $unset: { revision: '', structure: '' } });
    const before = await model.findById(id).lean();
    expect((await service.get(id, viewer)).structure).toBeNull();
    const initialized = await service.initialize(id, 0, viewer);
    const after = await model.findById(id).lean();
    expect(after!.createdAt).toEqual(before!.createdAt);
    expect(after!.updatedAt).toEqual(before!.updatedAt);
    const created = await service.createItem(
      id,
      {
        expectedRevision: 1,
        parentId: initialized.structure!.nodes[0].nodeId,
        name: 'Venta',
      },
      viewer,
    );
    const node = created.structure!.nodes[3];
    // Ambas solicitudes deben superar la lectura antes de competir en MongoDB.
    // Sin esta barrera, una lectura tardía podría ocultar una regresión del CAS.
    const originalWrite = repository.write.bind(repository);
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolveReady) => {
      release = resolveReady;
    });
    const barrier = vi
      .spyOn(repository, 'write')
      .mockImplementation(async (...args) => {
        if (++arrivals === 2) release();
        await ready;
        return originalWrite(...args);
      });
    const results = await Promise.allSettled([
      service.amount(
        id,
        node.nodeId,
        { expectedRevision: 2, state: 'CARGADO', input: '1,005' },
        viewer,
      ),
      service.amount(
        id,
        node.nodeId,
        { expectedRevision: 2, state: 'CARGADO', input: '2.005' },
        viewer,
      ),
    ]).finally(() => barrier.mockRestore());
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failed.reason.getStatus()).toBe(409);
    const stored = await model.findById(id).lean();
    expect(stored!.structure!.nodes[3].amount!.value!._bsontype).toBe(
      'Decimal128',
    );
    expect(stored!.revision).toBe(3);
  });
  it('inicialización concurrente no duplica raíces', async () => {
    const results = await Promise.allSettled([
      service.initialize(id, 0, viewer),
      service.initialize(id, 0, viewer),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    const result = await service.get(id, viewer);
    expect(result.revision).toBe(1);
    expect(result.structure!.nodes).toHaveLength(3);
    expect(await service.initialize(id, 0, viewer)).toEqual(result);
  });
  it('rollback real revierte catálogo, plantilla y primer snapshot tras fallar el segundo', async () => {
    const other = await model.create({
      branchId: 'abcdefabcdefabcdefabcdef',
      year: 2026,
      month: 9,
      createdBy: viewer.sub,
    });
    await service.initialize(id, 0, viewer);
    await service.initialize(other._id, 0, viewer);
    const preview = await service.preview(
      id,
      {
        expectedRevision: 1,
        operation: 'CREATE',
        parentCode: ROOTS[0].code,
        name: 'Servicios',
      },
      viewer,
    );
    const before = JSON.stringify(await model.find().sort({ _id: 1 }).lean());
    const original = repository.write.bind(repository);
    let writes = 0;
    const spy = vi
      .spyOn(repository, 'write')
      .mockImplementation(async (...args) => {
        if (++writes === 2)
          throw new Error('Abortar después de primera escritura');
        return original(...args);
      });
    try {
      await expect(
        service.confirm(
          id,
          { expectedRevision: 1, previewId: preview.previewId, confirm: true },
          viewer,
        ),
      ).rejects.toThrow('Abortar');
    } finally {
      spy.mockRestore();
    }
    expect(JSON.stringify(await model.find().sort({ _id: 1 }).lean())).toBe(
      before,
    );
    expect((await repository.template('2026-9')).categories).toHaveLength(0);
    expect(await connection!.model('EerrConcept').countDocuments()).toBe(0);
    expect(await repository.preview(preview.previewId)).not.toBeNull();
    const result = await service.confirm(
      id,
      { expectedRevision: 1, previewId: preview.previewId, confirm: true },
      viewer,
    );
    expect(result.revision).toBe(2);
    expect(
      (await service.get(other._id, viewer)).structure!.nodes[3].code,
    ).toBe(result.structure!.nodes[3].code);
  });
  it('la consulta y publicación reales quedan limitadas al año y mes', async () => {
    const august = await model.create({
      branchId: '123456789012345678901234',
      year: 2026,
      month: 8,
      createdBy: viewer.sub,
    });
    const nextYear = await model.create({
      branchId: '123456789012345678901234',
      year: 2027,
      month: 9,
      createdBy: viewer.sub,
    });
    await service.initialize(id, 0, viewer);
    await service.initialize(august._id, 0, viewer);
    const before = JSON.stringify(await model.findById(august._id).lean());
    const preview = await service.preview(
      id,
      {
        expectedRevision: 1,
        operation: 'CREATE',
        parentCode: ROOTS[0].code,
        name: 'Servicios',
      },
      viewer,
    );
    expect(preview.affected).toBe(1);
    await service.confirm(
      id,
      { expectedRevision: 1, previewId: preview.previewId, confirm: true },
      viewer,
    );
    expect(JSON.stringify(await model.findById(august._id).lean())).toBe(
      before,
    );
    expect((await service.get(nextYear._id, viewer)).structure).toBeNull();
    expect((await repository.template('2026-8')).categories).toHaveLength(0);
  });
  it('EP-04B1 persiste expresiones, cantidad exacta y notas; las elimina sin cambiar importe ni identidad', async () => {
    const initial = await service.initialize(id, 0, viewer);
    const created = await service.createItem(
      id,
      {
        expectedRevision: 1,
        parentId: initial.structure!.nodes[0].nodeId,
        name: 'Local',
      },
      viewer,
    );
    const node = created.structure!.nodes[3];
    await service.amount(
      id,
      node.nodeId,
      { expectedRevision: 2, state: 'CARGADO', input: ' (1000 + 500) / 3 ' },
      viewer,
    );
    await service.quantity(
      id,
      node.nodeId,
      { expectedRevision: 3, state: 'CARGADO', input: '999999999999' },
      viewer,
    );
    await service.itemNote(
      id,
      node.nodeId,
      { expectedRevision: 4, note: ' Primera\nSegunda ' },
      viewer,
    );
    await service.periodNote(
      id,
      { expectedRevision: 5, note: ' General\nPeríodo ' },
      viewer,
    );
    const stored = await model.findById(id).lean();
    expect(stored!.structure!.nodes[3]).toMatchObject({
      nodeId: node.nodeId,
      code: node.code,
      quantity: { state: 'CARGADO', value: '999999999999' },
      note: 'Primera\nSegunda',
      amount: { input: '(1000 + 500) / 3' },
    });
    expect(stored!.structure!.nodes[3].amount!.value!.toString()).toBe(
      '500.00',
    );
    expect(stored!.note).toBe('General\nPeríodo');
    const before = JSON.stringify(stored);
    await service.get(id, viewer);
    expect(JSON.stringify(await model.findById(id).lean())).toBe(before);
    await service.itemNote(
      id,
      node.nodeId,
      { expectedRevision: 6, note: '' },
      viewer,
    );
    await service.periodNote(id, { expectedRevision: 7, note: ' ' }, viewer);
    await service.quantity(
      id,
      node.nodeId,
      { expectedRevision: 8, state: 'SIN_CARGAR' },
      viewer,
    );
    const cleared = await model.findById(id).lean();
    expect(cleared).not.toHaveProperty('note');
    expect(cleared!.structure!.nodes[3]).not.toHaveProperty('note');
    expect(cleared!.structure!.nodes[3].amount!.value!.toString()).toBe(
      '500.00',
    );
    expect(cleared!.structure!.nodes[3].quantity).toEqual({
      state: 'SIN_CARGAR',
      value: null,
    });
    expect(cleared!.createdAt).toEqual(stored!.createdAt);
  });
  it('CAS real compartido entre nota general y snapshot: solo gana una edición concurrente', async () => {
    const initial = await service.initialize(id, 0, viewer);
    const created = await service.createItem(
      id,
      {
        expectedRevision: 1,
        parentId: initial.structure!.nodes[0].nodeId,
        name: 'A',
      },
      viewer,
    );
    const node = created.structure!.nodes[3];
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolveReady) => {
      release = resolveReady;
    });
    const wait = async () => {
      if (++arrivals === 2) release();
      await ready;
    };
    const write = repository.write.bind(repository);
    const writeNote = repository.writeNote.bind(repository);
    const a = vi
      .spyOn(repository, 'write')
      .mockImplementation(async (...args) => {
        await wait();
        return write(...args);
      });
    const b = vi
      .spyOn(repository, 'writeNote')
      .mockImplementation(async (...args) => {
        await wait();
        return writeNote(...args);
      });
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled([
        service.quantity(
          id,
          node.nodeId,
          { expectedRevision: 2, state: 'CARGADO', input: '5' },
          viewer,
        ),
        service.periodNote(
          id,
          { expectedRevision: 2, note: 'Concurrente' },
          viewer,
        ),
      ]);
    } finally {
      a.mockRestore();
      b.mockRestore();
    }
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason.getStatus()).toBe(409);
    const stored = await model.findById(id).lean();
    expect(stored!.revision).toBe(3);
    expect(
      Number(stored!.note !== undefined) +
        Number(stored!.structure!.nodes[3].quantity !== undefined),
    ).toBe(1);
  });
  it('archivo real modifica solo metadatos, progreso y revisión; restauración conserva BSON y timestamps', async () => {
    const initial = await service.initialize(id, 0, viewer);
    const created = await service.createItem(
      id,
      {
        expectedRevision: 1,
        parentId: initial.structure!.nodes[0].nodeId,
        name: 'Recuperable',
      },
      viewer,
    );
    const node = created.structure!.nodes[3];
    await service.amount(
      id,
      node.nodeId,
      { expectedRevision: 2, state: 'CARGADO', input: '1000+500' },
      viewer,
    );
    await service.quantity(
      id,
      node.nodeId,
      { expectedRevision: 3, state: 'CARGADO', input: '8' },
      viewer,
    );
    await service.itemNote(
      id,
      node.nodeId,
      { expectedRevision: 4, note: 'Conservar' },
      viewer,
    );
    const before = await model.findById(id).lean();
    const original = JSON.stringify(before!.structure!.nodes[3]);
    const archived = await service.changeArchive(
      id,
      node.nodeId,
      5,
      false,
      viewer,
    );
    expect(archived.progress.total).toBe(0);
    const after = await model.findById(id).lean();
    const { archive, ...retained } = after!.structure!.nodes[3];
    expect(JSON.stringify(retained)).toBe(original);
    expect(archive).toEqual({
      state: 'ARCHIVED',
      at: clock.now().toISOString(),
      by: viewer.sub,
    });
    expect(after!.updatedAt).toEqual(before!.updatedAt);
    expect(after!.createdAt).toEqual(before!.createdAt);
    await expect(
      service.changeArchive(id, node.nodeId, 5, true, viewer),
    ).rejects.toMatchObject({ status: 409 });
    const restored = await service.changeArchive(
      id,
      node.nodeId,
      6,
      true,
      viewer,
    );
    expect(restored.progress).toMatchObject({ total: 1, loaded: 1 });
    const final = await model.findById(id).lean();
    expect(final!.structure!.nodes).toHaveLength(
      before!.structure!.nodes.length,
    );
    const { archive: finalArchive, ...finalNode } = final!.structure!.nodes[3];
    expect(finalArchive).toEqual({ ...archive, state: 'ACTIVE' });
    expect(JSON.stringify(finalNode)).toBe(original);
    expect(final!.updatedAt).toEqual(before!.updatedAt);
  });
  it.each(['archive', 'amount'])(
    'CAS MongoDB: archivo contra %s sin pérdida ni doble revisión',
    async (contender) => {
      const initial = await service.initialize(id, 0, viewer);
      const created = await service.createItem(
        id,
        {
          expectedRevision: 1,
          parentId: initial.structure!.nodes[0].nodeId,
          name: 'Concurrente',
        },
        viewer,
      );
      const node = created.structure!.nodes[3];
      let arrivals = 0;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      const wait = async () => {
        if (++arrivals === 2) release();
        await ready;
      };
      const write = repository.write.bind(repository),
        writeArchive = repository.writeArchive.bind(repository);
      const a = vi
        .spyOn(repository, 'write')
        .mockImplementation(async (...args) => {
          await wait();
          return write(...args);
        });
      const b = vi
        .spyOn(repository, 'writeArchive')
        .mockImplementation(async (...args) => {
          await wait();
          return writeArchive(...args);
        });
      try {
        const results = await Promise.allSettled([
          service.changeArchive(id, node.nodeId, 2, false, viewer),
          contender === 'archive'
            ? service.changeArchive(id, node.nodeId, 2, false, viewer)
            : service.amount(
                id,
                node.nodeId,
                { expectedRevision: 2, state: 'CARGADO', input: '5+5' },
                viewer,
              ),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(
          (
            results.find(
              (r) => r.status === 'rejected',
            ) as PromiseRejectedResult
          ).reason.getStatus(),
        ).toBe(409);
        const saved = (await model.findById(id).lean())!;
        expect(saved.revision).toBe(3);
        const item = saved.structure!.nodes[3];
        expect(item.code).toBe(node.code);
        if (item.archive?.state === 'ARCHIVED')
          expect(item.amount!.state).toBe('SIN_CARGAR');
        else {
          expect(contender).toBe('amount');
          expect(item.amount!.value!.toString()).toBe('10.00');
        }
      } finally {
        a.mockRestore();
        b.mockRestore();
      }
    },
  );
  async function twoItems() {
    let current = await service.initialize(id, 0, viewer);
    const root = current.structure!.nodes[0];
    for (const name of ['A', 'B'])
      current = await service.createItem(
        id,
        { expectedRevision: current.revision, parentId: root.nodeId, name },
        viewer,
      );
    return {
      root,
      current,
      items: current.structure!.nodes.filter((n) => n.kind === 'ITEM'),
    };
  }
  it('EP-04B2 mueve con CAS sin reescribir BSON; no-op y restauración reinsertan correctamente', async () => {
    const { root, items } = await twoItems();
    await service.amount(
      id,
      items[0].nodeId,
      { expectedRevision: 3, state: 'CARGADO', input: '10+20' },
      viewer,
    );
    const before = await model.findById(id).lean();
    await service.moveItem(
      id,
      items[1].nodeId,
      { expectedRevision: 4, parentId: root.nodeId, position: 0 },
      viewer,
    );
    const moved = await model.findById(id).lean();
    for (const original of before!.structure!.nodes) {
      const node = moved!.structure!.nodes.find(
        (n) => n.nodeId === original.nodeId,
      )!;
      expect({ ...node, position: original.position }).toEqual(original);
    }
    const noOpBefore = JSON.stringify(moved);
    await service.moveItem(
      id,
      items[1].nodeId,
      { expectedRevision: 5, parentId: root.nodeId, position: 0 },
      viewer,
    );
    expect(JSON.stringify(await model.findById(id).lean())).toBe(noOpBefore);
    await service.changeArchive(id, items[1].nodeId, 5, false, viewer);
    const archived = await model.findById(id).lean();
    expect(
      archived!.structure!.nodes.find((n) => n.nodeId === items[0].nodeId)!
        .position,
    ).toBe(0);
    await service.changeArchive(id, items[1].nodeId, 6, true, viewer);
    const restored = await model.findById(id).lean();
    expect(
      restored!
        .structure!.nodes.filter((n) => n.kind === 'ITEM')
        .map((n) => n.position)
        .sort(),
    ).toEqual([0, 1]);
    expect(
      restored!.structure!.nodes.find((n) => n.nodeId === items[0].nodeId)!
        .amount,
    ).toEqual(
      before!.structure!.nodes.find((n) => n.nodeId === items[0].nodeId)!
        .amount,
    );
  });
  it.each(['move', 'rename', 'archive'])(
    'EP-04B2 CAS real con barrera: mover contra %s',
    async (contender) => {
      const { root, items } = await twoItems();
      let arrivals = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const wait = async () => {
        if (++arrivals === 2) release();
        await barrier;
      };
      const originals = {
        writeOrder: repository.writeOrder.bind(repository),
        write: repository.write.bind(repository),
        writeArchive: repository.writeArchive.bind(repository),
      };
      const mocks: { mockRestore(): void }[] = [
        vi
          .spyOn(repository, 'writeOrder')
          .mockImplementation(async (...args) => {
            await wait();
            return originals.writeOrder(...args);
          }),
      ];
      if (contender === 'rename')
        mocks.push(
          vi.spyOn(repository, 'write').mockImplementation(async (...args) => {
            await wait();
            return originals.write(...args);
          }),
        );
      if (contender === 'archive')
        mocks.push(
          vi
            .spyOn(repository, 'writeArchive')
            .mockImplementation(async (...args) => {
              await wait();
              return originals.writeArchive(...args);
            }),
        );
      try {
        const results = await Promise.allSettled([
          service.moveItem(
            id,
            items[1].nodeId,
            { expectedRevision: 3, parentId: root.nodeId, position: 0 },
            viewer,
          ),
          contender === 'move'
            ? service.moveItem(
                id,
                items[0].nodeId,
                { expectedRevision: 3, parentId: root.nodeId, position: 1 },
                viewer,
              )
            : contender === 'rename'
              ? service.renameItem(
                  id,
                  items[0].nodeId,
                  { expectedRevision: 3, name: 'Otro' },
                  viewer,
                )
              : service.changeArchive(id, items[0].nodeId, 3, false, viewer),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(
          (
            results.find(
              (r) => r.status === 'rejected',
            ) as PromiseRejectedResult
          ).reason.getStatus(),
        ).toBe(409);
        expect((await model.findById(id).lean())!.revision).toBe(4);
      } finally {
        mocks.forEach((mock) => mock.mockRestore());
      }
    },
  );
  it('EP-04B2 publicación global revierte plantilla y todos los snapshots ante fallo real', async () => {
    await service.initialize(id, 0, viewer);
    const other = await model.create({
      branchId: 'abcdefabcdefabcdefabcdef',
      year: 2026,
      month: 9,
      createdBy: viewer.sub,
    });
    await service.initialize(other._id, 0, viewer);
    for (const name of ['Categoría A', 'Categoría B']) {
      const current = await service.get(id, viewer);
      const preview = await service.preview(
        id,
        {
          expectedRevision: current.revision,
          operation: 'CREATE',
          parentCode: ROOTS[0].code,
          name,
        },
        viewer,
      );
      await service.confirm(
        id,
        {
          expectedRevision: current.revision,
          previewId: preview.previewId,
          confirm: true,
        },
        viewer,
      );
    }
    const current = await service.get(id, viewer),
      category = current.structure!.nodes.filter(
        (n) => n.kind === 'CATEGORY',
      )[1];
    const preview = await service.previewMove(
      id,
      {
        expectedRevision: current.revision,
        nodeId: category.nodeId,
        parentId: current.structure!.nodes[0].nodeId,
        position: 0,
      },
      viewer,
    );
    const before = JSON.stringify(await model.find().sort({ _id: 1 }).lean()),
      template = JSON.stringify(await repository.template('2026-9'));
    const write = repository.writeOrder.bind(repository);
    let calls = 0;
    const spy = vi
      .spyOn(repository, 'writeOrder')
      .mockImplementation(async (...args) => {
        if (++calls === 2) throw new Error('Rollback de movimiento simulado');
        return write(...args);
      });
    try {
      await expect(
        service.confirm(
          id,
          {
            expectedRevision: current.revision,
            previewId: preview.previewId,
            confirm: true,
          },
          viewer,
          'MOVE',
        ),
      ).rejects.toThrow('Rollback');
    } finally {
      spy.mockRestore();
    }
    expect(JSON.stringify(await model.find().sort({ _id: 1 }).lean())).toBe(
      before,
    );
    expect(JSON.stringify(await repository.template('2026-9'))).toBe(template);
    const result = await service.confirm(
      id,
      {
        expectedRevision: current.revision,
        previewId: preview.previewId,
        confirm: true,
      },
      viewer,
      'MOVE',
    );
    expect(result.revision).toBe(current.revision + 1);
  });
  async function cloneFixture() {
    const source = await model.create({
      branchId: '123456789012345678901234',
      year: 2026,
      month: 8,
      createdBy: viewer.sub,
    });
    let current = await service.initialize(source._id, 0, viewer);
    const preview = await service.preview(
      source._id,
      {
        expectedRevision: current.revision,
        operation: 'CREATE',
        parentCode: ROOTS[0].code,
        name: 'Ventas',
      },
      viewer,
    );
    current = await service.confirm(
      source._id,
      {
        expectedRevision: current.revision,
        previewId: preview.previewId,
        confirm: true,
      },
      viewer,
    );
    const category = current.structure!.nodes.find(
      (n) => n.kind === 'CATEGORY',
    )!;
    current = await service.createItem(
      source._id,
      {
        expectedRevision: current.revision,
        parentId: category.nodeId,
        name: 'Digitales',
      },
      viewer,
    );
    const item = current.structure!.nodes.find((n) => n.kind === 'ITEM')!;
    current = await service.amount(
      source._id,
      item.nodeId,
      { expectedRevision: current.revision, state: 'CARGADO', input: '10+20' },
      viewer,
    );
    return { sourceId: source._id, itemId: item.nodeId, current };
  }
  it.each(['ESTRUCTURA', 'ESTRUCTURA_Y_VALORES'] as const)(
    'EP-04C1 %s inicializa BSON y plantilla sin tocar origen',
    async (mode) => {
      const { sourceId, current } = await cloneFixture();
      const sourceBefore = JSON.stringify(
          await model.findById(sourceId).lean(),
        ),
        destinationBefore = await model.findById(id).lean();
      const p = await clones.preview(
        id,
        { sourceEerrId: sourceId, mode },
        viewer,
      );
      expect(await repository.existingTemplate('2026-9')).toBeNull();
      expect((await model.findById(id).lean())!.structure).toBeNull();
      const result = await clones.confirm(
        id,
        { sourceEerrId: sourceId, mode, previewToken: p.previewToken! },
        viewer,
      );
      const stored = await model.findById(id).lean(),
        item = stored!.structure!.nodes.find((n) => n.kind === 'ITEM')!;
      expect(result.revision).toBe(1);
      expect(stored!.createdAt).toEqual(destinationBefore!.createdAt);
      expect(stored!.updatedAt).toEqual(clock.now());
      expect(stored!.structure!.initializedAt).toEqual(clock.now());
      expect(stored!.structure!.initializedBy).toBe(viewer.sub);
      expect(item.nodeId).not.toBe(
        current.structure!.nodes.find((n) => n.kind === 'ITEM')!.nodeId,
      );
      expect(item.amount!.value?.toString() ?? null).toBe(
        mode === 'ESTRUCTURA' ? null : '30.00',
      );
      if (mode === 'ESTRUCTURA_Y_VALORES')
        expect(item.amount!.value!._bsontype).toBe('Decimal128');
      expect(JSON.stringify(await model.findById(sourceId).lean())).toBe(
        sourceBefore,
      );
      expect(
        (await repository.existingTemplate('2026-9'))!.categories,
      ).toHaveLength(1);
    },
  );
  it('EP-04C1 fallo tras sembrar plantilla revierte toda la transacción', async () => {
    const { sourceId } = await cloneFixture(),
      p = await clones.preview(
        id,
        { sourceEerrId: sourceId, mode: 'ESTRUCTURA' },
        viewer,
      ),
      before = JSON.stringify(await model.find().sort({ _id: 1 }).lean());
    const original = repository.initializeClone.bind(repository);
    const spy = vi
      .spyOn(repository, 'initializeClone')
      .mockImplementation(async (...args) => {
        await original(...args);
        throw new Error('Fallo después del snapshot');
      });
    try {
      await expect(
        clones.confirm(
          id,
          {
            sourceEerrId: sourceId,
            mode: 'ESTRUCTURA',
            previewToken: p.previewToken!,
          },
          viewer,
        ),
      ).rejects.toThrow('Fallo después');
    } finally {
      spy.mockRestore();
    }
    expect(JSON.stringify(await model.find().sort({ _id: 1 }).lean())).toBe(
      before,
    );
    expect(await repository.existingTemplate('2026-9')).toBeNull();
  });
  it('EP-04C1 dos confirmaciones concurrentes solo inicializan una vez', async () => {
    const { sourceId } = await cloneFixture(),
      p = await clones.preview(
        id,
        { sourceEerrId: sourceId, mode: 'ESTRUCTURA' },
        viewer,
      );
    const input = {
      sourceEerrId: sourceId,
      mode: 'ESTRUCTURA' as const,
      previewToken: p.previewToken!,
    };
    const results = await Promise.allSettled([
      clones.confirm(id, input, viewer),
      clones.confirm(id, input, viewer),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      ).reason.getStatus(),
    ).toBe(409);
    expect((await model.findById(id).lean())!.revision).toBe(1);
  });
  it.each(['source', 'template', 'base'] as const)(
    'EP-04C1 cambio de %s invalida preview sin sobrescritura',
    async (kind) => {
      const { sourceId, itemId, current } = await cloneFixture(),
        p = await clones.preview(
          id,
          { sourceEerrId: sourceId, mode: 'ESTRUCTURA' },
          viewer,
        );
      if (kind === 'source')
        await service.amount(
          sourceId,
          itemId,
          { expectedRevision: current.revision, state: 'CARGADO', input: '99' },
          viewer,
        );
      if (kind === 'base') await service.initialize(id, 0, viewer);
      if (kind === 'template')
        await repository.transaction(async (session) => {
          await repository.lockTemplate('2026-9', session);
        });
      const before = JSON.stringify(await model.find().sort({ _id: 1 }).lean()),
        template = JSON.stringify(await repository.existingTemplate('2026-9'));
      await expect(
        clones.confirm(
          id,
          {
            sourceEerrId: sourceId,
            mode: 'ESTRUCTURA',
            previewToken: p.previewToken!,
          },
          viewer,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(JSON.stringify(await model.find().sort({ _id: 1 }).lean())).toBe(
        before,
      );
      expect(JSON.stringify(await repository.existingTemplate('2026-9'))).toBe(
        template,
      );
    },
  );
  async function importFixture() {
    let current = await service.initialize(id, 0, viewer);
    const parentId = current.structure!.nodes[0].nodeId;
    for (const name of ['Primero', 'Segundo'])
      current = await service.createItem(
        id,
        { expectedRevision: current.revision, parentId, name },
        viewer,
      );
    const items = current.structure!.nodes.filter((n) => n.kind === 'ITEM');
    current = await service.amount(
      id,
      items[0].nodeId,
      { expectedRevision: current.revision, state: 'CARGADO', input: '5+5' },
      viewer,
    );
    current = await service.itemNote(
      id,
      items[0].nodeId,
      { expectedRevision: current.revision, note: 'Nota conservada' },
      viewer,
    );
    current = await service.periodNote(
      id,
      { expectedRevision: current.revision, note: 'Nota general conservada' },
      viewer,
    );
    const grid = readCsv(await imports.template(id, 'csv', viewer));
    grid[1][5] = '12,345';
    grid[1][6] = '0';
    grid[2][5] = '0';
    grid[2][6] = '3';
    const file = {
      originalname: 'carga.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(
        '\uFEFF' + grid.map((r) => r.map(csvEscape).join(';')).join('\r\n'),
      ),
    };
    return { current, items, file };
  }
  it('EP-04C2 importa varias filas atómicamente en Decimal128 preservando notas y estructura', async () => {
    const { file, current } = await importFixture(),
      before = await model.findById(id).lean(),
      p = await imports.preview(id, file, viewer);
    expect(JSON.stringify(await model.findById(id).lean())).toBe(
      JSON.stringify(before),
    );
    const r = await imports.confirm(id, file, p.previewToken!, viewer),
      stored = await model.findById(id).lean();
    expect(r.changedFields).toBe(4);
    expect(r.result.revision).toBe(current.revision + 1);
    expect(r.result.progress.status).toBe('CARGADO');
    expect(r.result.note).toBe('Nota general conservada');
    const items = stored!.structure!.nodes.filter((n) => n.kind === 'ITEM');
    expect(items[0].amount!.value!._bsontype).toBe('Decimal128');
    expect(items[0].amount!.value!.toString()).toBe('12.35');
    expect(items[1].amount!.value!.toString()).toBe('0.00');
    expect(items[0].note).toBe('Nota conservada');
    expect(stored!.createdAt).toEqual(before!.createdAt);
    expect(stored!.createdBy).toEqual(before!.createdBy);
    expect(stored!.updatedAt).toEqual(clock.now());
    expect(stored!.structure!.initializedAt).toEqual(
      before!.structure!.initializedAt,
    );
    expect(
      stored!.structure!.nodes.map((n) => [
        n.nodeId,
        n.code,
        n.parentId,
        n.position,
        n.name,
      ]),
    ).toEqual(
      before!.structure!.nodes.map((n) => [
        n.nodeId,
        n.code,
        n.parentId,
        n.position,
        n.name,
      ]),
    );
  });
  it('EP-04C2 rechaza importe XLSX numérico sin escribir ítems ni incrementar revisión', async () => {
    await importFixture();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      new Uint8Array(await imports.template(id, 'xlsx', viewer)).buffer,
    );
    const sheet = workbook.getWorksheet('Carga')!;
    sheet.getCell('F2').value = 1500;
    sheet.getCell('F3').value = '1500,25';
    const file = {
      originalname: 'carga.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    };
    const before = JSON.stringify(await model.findById(id).lean());
    const preview = await imports.preview(id, file, viewer);
    expect(preview.issues).toMatchObject([
      { row: 2, field: 'importe_o_expresion' },
    ]);
    expect(preview.previewToken).toBeNull();
    expect(JSON.stringify(preview)).not.toContain('0.01');
    expect(JSON.stringify(await model.findById(id).lean())).toBe(before);
    await expect(
      imports.confirm(id, file, 'inventado', viewer),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.stringify(await model.findById(id).lean())).toBe(before);
  });
  it('EP-04C2 persiste el redondeo exacto del literal textual largo como Decimal128', async () => {
    const { file } = await importFixture();
    const grid = readCsv(file.buffer);
    grid[1][5] = '0.004999999999999999999';
    file.buffer = Buffer.from(
      '\uFEFF' + grid.map((r) => r.map(csvEscape).join(';')).join('\r\n'),
    );
    const preview = await imports.preview(id, file, viewer);
    expect(preview.issues).toEqual([]);
    expect(preview.rows[0].after.amount.value).toBe('0.00');
    await imports.confirm(id, file, preview.previewToken!, viewer);
    const stored = await model.findById(id).lean();
    const amount = stored!.structure!.nodes.find(
      (n) => n.kind === 'ITEM',
    )!.amount!;
    expect(amount.value!._bsontype).toBe('Decimal128');
    expect(amount.value!.toString()).toBe('0.00');
  });
  it('EP-04C2 rollback después de escritura no deja ninguna fila parcial', async () => {
    const { file } = await importFixture(),
      p = await imports.preview(id, file, viewer),
      before = JSON.stringify(await model.findById(id).lean());
    const original = repository.writeImport.bind(repository),
      spy = vi
        .spyOn(repository, 'writeImport')
        .mockImplementation(async (...args) => {
          await original(...args);
          throw new Error('Fallo tras importar');
        });
    try {
      await expect(
        imports.confirm(id, file, p.previewToken!, viewer),
      ).rejects.toThrow('Fallo tras importar');
    } finally {
      spy.mockRestore();
    }
    expect(JSON.stringify(await model.findById(id).lean())).toBe(before);
  });
  it('EP-04C2 dos importaciones concurrentes y reintento solo aplican una', async () => {
    const { file, current } = await importFixture(),
      a = await imports.preview(id, file, viewer),
      b = await imports.preview(id, file, viewer);
    const results = await Promise.allSettled([
      imports.confirm(id, file, a.previewToken!, viewer),
      imports.confirm(id, file, b.previewToken!, viewer),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      ).reason.getStatus(),
    ).toBe(409);
    const before = JSON.stringify(await model.findById(id).lean());
    await expect(
      imports.confirm(id, file, a.previewToken!, viewer),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.stringify(await model.findById(id).lean())).toBe(before);
    expect((await model.findById(id).lean())!.revision).toBe(
      current.revision + 1,
    );
  });
  it.each(['archive', 'move', 'values'] as const)(
    'EP-04C2 cambio %s invalida preview sin modificar datos',
    async (kind) => {
      const { file, current, items } = await importFixture(),
        p = await imports.preview(id, file, viewer);
      if (kind === 'archive')
        await service.changeArchive(
          id,
          items[0].nodeId,
          current.revision,
          false,
          viewer,
        );
      if (kind === 'move')
        await service.moveItem(
          id,
          items[0].nodeId,
          {
            expectedRevision: current.revision,
            parentId: items[0].parentId!,
            position: 1,
          },
          viewer,
        );
      if (kind === 'values')
        await service.amount(
          id,
          items[0].nodeId,
          { expectedRevision: current.revision, state: 'CARGADO', input: '99' },
          viewer,
        );
      const before = JSON.stringify(await model.findById(id).lean());
      await expect(
        imports.confirm(id, file, p.previewToken!, viewer),
      ).rejects.toMatchObject({ status: 409 });
      expect(JSON.stringify(await model.findById(id).lean())).toBe(before);
      if (kind !== 'values')
        await expect(imports.preview(id, file, viewer)).rejects.toMatchObject({
          status: 409,
        });
    },
  );
  it('EP-04C2 CAS del repositorio rechaza revisión obsoleta incluso dentro de transacción nueva', async () => {
    const { current, items } = await importFixture();
    const plan = importPlan(current.structure!, [
      { row: 2, code: items[0].code, amount: '50', quantity: '' },
    ]);
    await service.amount(
      id,
      items[0].nodeId,
      { expectedRevision: current.revision, state: 'CARGADO', input: '77' },
      viewer,
    );
    const before = JSON.stringify(await model.findById(id).lean());
    await expect(
      repository.transaction((session) =>
        repository.writeImport(
          id,
          current.revision,
          current.structure!,
          plan.changes,
          clock.now(),
          session,
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.stringify(await model.findById(id).lean())).toBe(before);
  });
  it('EP-04C2 fila inválida bloquea también las válidas', async () => {
    const { file } = await importFixture(),
      grid = readCsv(file.buffer);
    grid[2][5] = '1/0';
    file.buffer = Buffer.from(
      grid.map((r) => r.map(csvEscape).join(';')).join('\n'),
    );
    const before = JSON.stringify(await model.findById(id).lean()),
      p = await imports.preview(id, file, viewer);
    expect(p.issues).toHaveLength(1);
    expect(p.previewToken).toBeNull();
    await expect(
      imports.confirm(id, file, 'inventado', viewer),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.stringify(await model.findById(id).lean())).toBe(before);
  });
  async function pendingFixture() {
    let current = await service.initialize(id, 0, viewer);
    for (let index = 0; index < 5; index++)
      current = await service.createItem(
        id,
        {
          expectedRevision: current.revision,
          parentId: current.structure!.nodes[0].nodeId,
          name: `Pendiente ${index}`,
        },
        viewer,
      );
    const items = current.structure!.nodes.filter((n) => n.kind === 'ITEM');
    for (const [index, input] of [
      [0, '5+5'],
      [1, '0'],
    ] as const)
      current = await service.amount(
        id,
        items[index].nodeId,
        { expectedRevision: current.revision, state: 'CARGADO', input },
        viewer,
      );
    current = await service.quantity(
      id,
      items[2].nodeId,
      { expectedRevision: current.revision, state: 'CARGADO', input: '17' },
      viewer,
    );
    current = await service.quantity(
      id,
      items[3].nodeId,
      { expectedRevision: current.revision, state: 'SIN_CARGAR' },
      viewer,
    );
    current = await service.itemNote(
      id,
      items[2].nodeId,
      { expectedRevision: current.revision, note: 'Conservar nota' },
      viewer,
    );
    current = await service.periodNote(
      id,
      { expectedRevision: current.revision, note: 'Conservar general' },
      viewer,
    );
    current = await service.changeArchive(
      id,
      items[4].nodeId,
      current.revision,
      false,
      viewer,
    );
    return { current, items };
  }
  it('EP-04C3 lote Decimal128 preserva todo excepto importes pendientes, progreso, revision y updatedAt', async () => {
    const { current, items } = await pendingFixture(),
      before = await model.findById(id).lean(),
      p = await completePending.preview(id, viewer);
    expect(await model.findById(id).lean()).toEqual(before);
    expect(p.affected.map((n) => n.nodeId)).toEqual([
      items[2].nodeId,
      items[3].nodeId,
    ]);
    const r = await completePending.confirm(id, p.previewToken!, viewer),
      after = await model.findById(id).lean();
    expect(r.affectedItems).toBe(2);
    expect(r.result.progress).toEqual({
      total: 4,
      loaded: 4,
      pending: 0,
      status: 'CARGADO',
    });
    const expected = before!;
    for (const n of expected.structure!.nodes.filter((n) =>
      p.affected.some((a) => a.nodeId === n.nodeId),
    )) {
      const actual = after!.structure!.nodes.find(
        (a) => a.nodeId === n.nodeId,
      )!;
      expect(actual.amount!.value!._bsontype).toBe('Decimal128');
      expect(actual.amount!.value!.toString()).toBe('0.00');
      expect(actual.amount!.input).toBeNull();
      expect(actual.amount!.state).toBe('CARGADO');
      n.amount = actual.amount;
    }
    expected.revision = current.revision + 1;
    expected.updatedAt = clock.now();
    expected.loadStatus = after!.loadStatus;
    expect(after).toEqual(expected);
    expect(after).not.toHaveProperty('closedAt');
    expect(after).not.toHaveProperty('updatedBy');
  });
  it('EP-04C3 rollback después de escribir revierte todo', async () => {
    await pendingFixture();
    const p = await completePending.preview(id, viewer),
      before = await model.findById(id).lean(),
      original = repository.writeImport.bind(repository),
      spy = vi
        .spyOn(repository, 'writeImport')
        .mockImplementation(async (...args) => {
          await original(...args);
          throw Error('Fallo después de completar');
        });
    try {
      await expect(
        completePending.confirm(id, p.previewToken!, viewer),
      ).rejects.toThrow('Fallo después de completar');
    } finally {
      spy.mockRestore();
    }
    expect(await model.findById(id).lean()).toEqual(before);
  });
  it('EP-04C3 concurrencia y doble envío no duplican revisión ni timestamps', async () => {
    const { current } = await pendingFixture(),
      p = await completePending.preview(id, viewer);
    const r = await Promise.allSettled([
      completePending.confirm(id, p.previewToken!, viewer),
      completePending.confirm(id, p.previewToken!, viewer),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        r.find((x) => x.status === 'rejected') as PromiseRejectedResult
      ).reason.getStatus(),
    ).toBe(409);
    const before = await model.findById(id).lean();
    expect(before!.revision).toBe(current.revision + 1);
    await expect(
      completePending.confirm(id, p.previewToken!, viewer),
    ).rejects.toMatchObject({ status: 409 });
    expect(await model.findById(id).lean()).toEqual(before);
  });
  it.each(['amount', 'move', 'archive'])(
    'EP-04C3 cambio %s después del preview rechaza lote completo',
    async (kind) => {
      const { current, items } = await pendingFixture(),
        p = await completePending.preview(id, viewer);
      if (kind === 'amount')
        await service.amount(
          id,
          items[2].nodeId,
          { expectedRevision: current.revision, state: 'CARGADO', input: '99' },
          viewer,
        );
      if (kind === 'move')
        await service.moveItem(
          id,
          items[2].nodeId,
          {
            expectedRevision: current.revision,
            parentId: items[2].parentId!,
            position: 0,
          },
          viewer,
        );
      if (kind === 'archive')
        await service.changeArchive(
          id,
          items[2].nodeId,
          current.revision,
          false,
          viewer,
        );
      const before = await model.findById(id).lean();
      await expect(
        completePending.confirm(id, p.previewToken!, viewer),
      ).rejects.toMatchObject({ status: 409 });
      expect(await model.findById(id).lean()).toEqual(before);
    },
  );
  it('EP-04C3 CAS real rechaza revisión obsoleta en transacción nueva', async () => {
    const { current, items } = await pendingFixture(),
      plan = completePendingPlan(current.structure!);
    await service.amount(
      id,
      items[2].nodeId,
      { expectedRevision: current.revision, state: 'CARGADO', input: '12' },
      viewer,
    );
    const before = await model.findById(id).lean();
    await expect(
      repository.transaction((session) =>
        repository.writeImport(
          id,
          current.revision,
          current.structure!,
          plan.changes,
          clock.now(),
          session,
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await model.findById(id).lean()).toEqual(before);
  });
  it('EP-04C3 no-op sin escrituras ni revisión; permite editar, expresión y volver a SIN_CARGAR', async () => {
    const { items } = await pendingFixture(),
      p = await completePending.preview(id, viewer);
    let r = (await completePending.confirm(id, p.previewToken!, viewer)).result;
    const before = await model.findById(id).lean(),
      noop = await completePending.preview(id, viewer);
    expect(noop.previewToken).toBeNull();
    expect(noop.affected).toEqual([]);
    await expect(
      completePending.confirm(id, 'inventado', viewer),
    ).rejects.toMatchObject({ status: 409 });
    expect(await model.findById(id).lean()).toEqual(before);
    r = await service.amount(
      id,
      items[2].nodeId,
      { expectedRevision: r.revision, state: 'CARGADO', input: '10+20' },
      viewer,
    );
    expect(
      r.structure!.nodes.find((n) => n.nodeId === items[2].nodeId)!.amount!
        .value,
    ).toBe('30.00');
    r = await service.amount(
      id,
      items[2].nodeId,
      { expectedRevision: r.revision, state: 'SIN_CARGAR' },
      viewer,
    );
    expect(r.progress.pending).toBe(1);
    expect((await completePending.preview(id, viewer)).affected).toHaveLength(
      1,
    );
  });

  it('EP-05A.1 lee una sola revisión Decimal128 sin escribir y sigue ediciones, cero, limpieza y archivo', async () => {
    expect((await analysis.get(id, viewer)).initialized).toBe(false);
    let current = await service.initialize(id, 0, viewer);
    const roots = current.structure!.nodes.filter(
      (node) => node.kind === 'BLOCK',
    );
    for (const [index, name] of ['Venta', 'Costo', 'Gasto'].entries())
      current = await service.createItem(
        id,
        {
          expectedRevision: current.revision,
          parentId: roots[index]!.nodeId,
          name,
        },
        viewer,
      );
    const items = current.structure!.nodes.filter(
      (node) => node.kind === 'ITEM',
    );
    for (const [index, input] of ['100.00', '60.00', '20.00'].entries())
      current = await service.amount(
        id,
        items[index]!.nodeId,
        { expectedRevision: current.revision, state: 'CARGADO', input },
        viewer,
      );
    const before = await model.findById(id).lean();
    const complete = await analysis.get(id, viewer);
    expect(complete.sourceRevision).toBe(current.revision);
    expect(complete.blocks.map((block) => block.value)).toEqual([
      '100.00',
      '60.00',
      '20.00',
    ]);
    expect(complete.metrics.grossMargin.value).toBe('40.00');
    expect(complete.metrics.netResult.value).toBe('20.00');
    expect(await model.findById(id).lean()).toEqual(before);
    expect(before!.structure!.nodes[3].amount!.value!._bsontype).toBe(
      'Decimal128',
    );
    current = await service.amount(
      id,
      items[1]!.nodeId,
      { expectedRevision: current.revision, state: 'CARGADO', input: '0' },
      viewer,
    );
    expect((await analysis.get(id, viewer)).metrics.grossMargin.value).toBe(
      '100.00',
    );
    current = await service.amount(
      id,
      items[1]!.nodeId,
      { expectedRevision: current.revision, state: 'SIN_CARGAR' },
      viewer,
    );
    expect((await analysis.get(id, viewer)).metrics.grossMargin.reason).toBe(
      'PENDING_INPUTS',
    );
    current = await service.changeArchive(
      id,
      items[1]!.nodeId,
      current.revision,
      false,
      viewer,
    );
    expect((await analysis.get(id, viewer)).blocks[1].status).toBe('EMPTY');
    current = await service.changeArchive(
      id,
      items[1]!.nodeId,
      current.revision,
      true,
      viewer,
    );
    expect((await analysis.get(id, viewer)).blocks[1].status).toBe('PENDING');
    expect((await analysis.get(id, viewer)).sourceRevision).toBe(
      current.revision,
    );
  });

  it('EP-05A.1 refleja importación y completar pendientes en la nueva revisión', async () => {
    const { file } = await importFixture();
    const prior = await analysis.get(id, viewer);
    expect(prior.blocks[0].status).toBe('PARTIAL');
    const preview = await imports.preview(id, file, viewer);
    expect((await analysis.get(id, viewer)).sourceRevision).toBe(
      prior.sourceRevision,
    );
    const imported = await imports.confirm(
      id,
      file,
      preview.previewToken!,
      viewer,
    );
    const after = await analysis.get(id, viewer);
    expect(after.sourceRevision).toBe(imported.result.revision);
    expect(after.blocks[0]).toMatchObject({
      status: 'COMPLETE',
      value: '12.35',
    });
  });

  it('EP-05A.1 completa ceros y lecturas concurrentes con una escritura conservan cada revisión', async () => {
    const { current, items } = await pendingFixture();
    const before = await analysis.get(id, viewer);
    expect(before.sourceRevision).toBe(current.revision);
    expect(before.blocks[0]).toMatchObject({
      status: 'PARTIAL',
      value: '10.00',
    });
    const preview = await completePending.preview(id, viewer);
    const confirmed = await completePending.confirm(
      id,
      preview.previewToken!,
      viewer,
    );
    const after = await analysis.get(id, viewer);
    expect(after.sourceRevision).toBe(confirmed.result.revision);
    expect(after.blocks[0]).toMatchObject({
      status: 'COMPLETE',
      value: '10.00',
    });
    expect(before.sourceRevision).toBeLessThan(after.sourceRevision);
    expect(before.blocks[0].status).toBe('PARTIAL');
    const simultaneousReads = Array.from({ length: 20 }, () =>
      analysis.get(id, viewer),
    );
    const update = service.amount(
      id,
      items[0].nodeId,
      { expectedRevision: after.sourceRevision, state: 'CARGADO', input: '20' },
      viewer,
    );
    const snapshots = await Promise.all(simultaneousReads);
    const updated = await update;
    for (const snapshot of snapshots) {
      expect([
        [after.sourceRevision, '10.00'],
        [updated.revision, '20.00'],
      ]).toContainEqual([snapshot.sourceRevision, snapshot.blocks[0].value]);
    }
    expect((await analysis.get(id, viewer)).blocks[0].value).toBe('20.00');
  });

  it('EP-05B.1 guarda Decimal128, CAS, no-op, cambio de modo, borrado e histórico sin campo', async () => {
    const legacy = await analysis.get(id, viewer);
    expect(legacy.salesGoal).toBeNull();
    expect(legacy.projections.breakEvenSales.reason).toBe('UNINITIALIZED');
    await expect(
      salesGoals.put(id, { expectedRevision: 0, goal: null }, viewer),
    ).rejects.toMatchObject({ status: 400 });
    await service.initialize(id, 0, viewer);
    const percent = await salesGoals.put(
      id,
      {
        expectedRevision: 1,
        goal: { mode: 'NET_MARGIN_PERCENT', value: '10' },
      },
      viewer,
    );
    expect(percent.revision).toBe(2);
    expect(percent.salesGoal?.value).toBe('10.0000');
    const raw = await model.findById(id).lean();
    expect(raw!.salesGoal!.value._bsontype).toBe('Decimal128');
    expect(raw!.salesGoal!.value.toString()).toBe('10.0000');
    const noOp = await salesGoals.put(
      id,
      {
        expectedRevision: 2,
        goal: { mode: 'NET_MARGIN_PERCENT', value: '10.0000' },
      },
      viewer,
    );
    expect(noOp.revision).toBe(2);
    expect(await model.findById(id).lean()).toEqual(raw);
    await expect(
      salesGoals.put(id, { expectedRevision: 1, goal: null }, viewer),
    ).rejects.toMatchObject({ status: 409 });
    const amount = await salesGoals.put(
      id,
      {
        expectedRevision: 2,
        goal: { mode: 'NET_PROFIT_AMOUNT', value: '5' },
      },
      viewer,
    );
    expect(amount.salesGoal?.value).toBe('5.00');
    expect((await analysis.get(id, viewer)).sourceRevision).toBe(3);
    const removed = await salesGoals.put(
      id,
      { expectedRevision: 3, goal: null },
      viewer,
    );
    expect(removed).toMatchObject({ revision: 4, salesGoal: null });
    expect((await analysis.get(id, viewer)).salesGoal).toBeNull();
  });

  it('EP-05B.1 dos metas concurrentes tienen un ganador y una revisión', async () => {
    await service.initialize(id, 0, viewer);
    const access = (salesGoals as unknown as { eerrs: EerrService }).eerrs;
    const original = access.readAuthorized.bind(access);
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolveReady) => {
      release = resolveReady;
    });
    const barrier = vi
      .spyOn(access, 'readAuthorized')
      .mockImplementation(async (...args) => {
        const row = await original(...args);
        if (++arrivals === 2) release();
        await ready;
        return row;
      });
    const attempts = await Promise.allSettled([
      salesGoals.put(
        id,
        {
          expectedRevision: 1,
          goal: { mode: 'NET_PROFIT_AMOUNT', value: '1.00' },
        },
        viewer,
      ),
      salesGoals.put(
        id,
        {
          expectedRevision: 1,
          goal: { mode: 'NET_PROFIT_AMOUNT', value: '2.00' },
        },
        viewer,
      ),
    ]);
    barrier.mockRestore();
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === 'rejected'),
    ).toHaveLength(1);
    expect((await model.findById(id).lean())!.revision).toBe(2);
  });

  it('EP-05B.1 edición de importes actualiza proyecciones sin borrar meta ni escribir en GET', async () => {
    let current = await service.initialize(id, 0, viewer);
    const roots = current.structure!.nodes.filter(
      (node) => node.kind === 'BLOCK',
    );
    for (let index = 0; index < 3; index++)
      current = await service.createItem(
        id,
        {
          expectedRevision: current.revision,
          parentId: roots[index]!.nodeId,
          name: `Ítem ${index}`,
        },
        viewer,
      );
    const items = current.structure!.nodes.filter(
      (node) => node.kind === 'ITEM',
    );
    for (const [index, input] of ['100.00', '60.00', '20.00'].entries())
      current = await service.amount(
        id,
        items[index]!.nodeId,
        { expectedRevision: current.revision, state: 'CARGADO', input },
        viewer,
      );
    const saved = await salesGoals.put(
      id,
      {
        expectedRevision: current.revision,
        goal: { mode: 'NET_MARGIN_PERCENT', value: '10.0000' },
      },
      viewer,
    );
    const before = await model.findById(id).lean();
    const result = await analysis.get(id, viewer);
    expect(result).toMatchObject({
      sourceRevision: saved.revision,
      salesGoal: { value: '10.0000' },
      projections: {
        breakEvenSales: { value: '50.00' },
        targetSales: { value: '66.67' },
      },
    });
    expect(await model.findById(id).lean()).toEqual(before);
    current = await service.amount(
      id,
      items[1]!.nodeId,
      { expectedRevision: saved.revision, state: 'CARGADO', input: '70.00' },
      viewer,
    );
    expect(
      (await analysis.get(id, viewer)).projections.breakEvenSales.value,
    ).toBe('66.67');
    expect((await model.findById(id).lean())!.salesGoal!.value.toString()).toBe(
      '10.0000',
    );
  });

  it.each(['ESTRUCTURA', 'ESTRUCTURA_Y_VALORES'] as const)(
    'EP-05B.1 clonar %s no hereda meta del origen',
    async (mode) => {
      const { sourceId, current } = await cloneFixture();
      await salesGoals.put(
        sourceId,
        {
          expectedRevision: current.revision,
          goal: { mode: 'NET_PROFIT_AMOUNT', value: '100.00' },
        },
        viewer,
      );
      const preview = await clones.preview(
        id,
        { sourceEerrId: sourceId, mode },
        viewer,
      );
      await clones.confirm(
        id,
        { sourceEerrId: sourceId, mode, previewToken: preview.previewToken! },
        viewer,
      );
      expect((await analysis.get(id, viewer)).salesGoal).toBeNull();
      expect((await analysis.get(sourceId, viewer)).salesGoal?.value).toBe(
        '100.00',
      );
    },
  );

  it('EP-05B.1 importación preserva meta', async () => {
    const { file, current } = await importFixture();
    await salesGoals.put(
      id,
      {
        expectedRevision: current.revision,
        goal: { mode: 'NET_PROFIT_AMOUNT', value: '9.00' },
      },
      viewer,
    );
    const preview = await imports.preview(id, file, viewer);
    await imports.confirm(id, file, preview.previewToken!, viewer);
    expect((await analysis.get(id, viewer)).salesGoal?.value).toBe('9.00');
  });

  it('EP-05B.1 completar pendientes preserva meta', async () => {
    const { current } = await pendingFixture();
    await salesGoals.put(
      id,
      {
        expectedRevision: current.revision,
        goal: { mode: 'NET_PROFIT_AMOUNT', value: '9.00' },
      },
      viewer,
    );
    const pending = await completePending.preview(id, viewer);
    expect(pending.previewToken).not.toBeNull();
    await completePending.confirm(id, pending.previewToken!, viewer);
    expect((await analysis.get(id, viewer)).salesGoal?.value).toBe('9.00');
  });
});

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
        { id: '123456789012345678901234' },
        { id: 'abcdefabcdefabcdefabcdef' },
      ],
    } as unknown as BranchesService;
    service = new StructureService(
      repository,
      new EerrService(model as unknown as Model<EerrDocument>, branches, clock),
      clock,
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
});

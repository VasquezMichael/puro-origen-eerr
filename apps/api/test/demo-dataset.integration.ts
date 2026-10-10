import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import mongoose, { Types, type Connection } from 'mongoose';
import {
  APPLY_PHRASE,
  CLEAN_PHRASE,
  RESTORE_PHRASE,
  applyDemo,
  cleanDemo,
  makeDemoPlan,
  publicDemoPlan,
  readDemoBackup,
  restoreDemoBackup,
} from '../src/scripts/demo-dataset.js';
import {
  DEMO_CATEGORIES,
  DEMO_ITEMS,
} from '../src/scripts/demo-dataset.manifest.js';
import { ROOTS } from '@puro-origen/domain';

describe('dataset demo en replica set efímero local', () => {
  let child: ChildProcess | undefined;
  let directory = '';
  let connection: Connection;
  const database = 'demo_dataset_local_test';
  const fingerprint = 'local-test';
  const names = ['CALLE 13', 'CALLE 50', 'CALLE 59'];
  const branchIds = names.map(() => new Types.ObjectId());
  const adminId = new Types.ObjectId();

  beforeAll(async () => {
    const binary = process.env.MONGOD_BINARY;
    if (!binary || !isAbsolute(binary))
      throw new Error(
        'MONGOD_BINARY debe ser una ruta absoluta a mongod local',
      );
    directory = await mkdtemp(join(tmpdir(), 'puro-demo-dataset-'));
    await mkdir(join(directory, 'data'));
    const port = await new Promise<number>((done) => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Puerto local inválido');
        server.close(() => done(address.port));
      });
    });
    const replica = `demo-${randomUUID()}`;
    child = spawn(
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
    let spawnError: Error | undefined;
    child.on('error', (error) => {
      spawnError = error;
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) throw spawnError;
      const candidate = mongoose.createConnection(
        `mongodb://127.0.0.1:${port}/${database}?directConnection=true`,
        { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 500 },
      );
      try {
        connection = await candidate.asPromise();
        break;
      } catch {
        await candidate.close().catch(() => undefined);
      }
    }
    if (!connection) throw new Error('No inició MongoDB local');
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
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!primary) throw new Error('El replica set local no eligió primario');
  }, 60000);
  afterAll(async () => {
    await connection?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((done) =>
        child!.once('exit', () => done()),
      );
      child.kill();
      await exited;
    }
    if (directory) {
      const target = resolve(directory);
      if (!target.startsWith(resolve(tmpdir()) + '\\puro-demo-dataset-'))
        throw new Error('Directorio temporal fuera de alcance');
      await rm(target, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  });
  beforeEach(async () => {
    await connection.db!.dropDatabase();
    await connection.db!.collection('branches').insertMany(
      names.map((name, index) => ({
        _id: branchIds[index],
        name,
        normalizedName: name.toLowerCase(),
        startDate: new Date('2026-01-01T12:00:00Z'),
        active: true,
      })),
    );
    await connection.db!.collection('users').insertOne({
      _id: adminId,
      isAdmin: true,
      active: true,
      name: 'Admin de prueba',
    });
  });
  const plan = () =>
    makeDemoPlan(
      connection,
      database,
      fingerprint,
      undefined,
      new Date('2026-10-09T12:00:00Z'),
    );
  const confirm = (hash: string) => ({
    database,
    planHash: hash,
    confirm: APPLY_PHRASE,
  });
  const confirmClean = (hash: string) => ({
    database,
    planHash: hash,
    confirm: CLEAN_PHRASE,
  });

  it('plan lee sin escribir y no muestra configuración ni datos del administrador', async () => {
    const before = await connection.db!.listCollections().toArray();
    const branchesBefore = await connection
      .db!.collection('branches')
      .find()
      .sort({ _id: 1 })
      .toArray();
    const usersBefore = await connection
      .db!.collection('users')
      .find()
      .toArray();
    const result = await plan();
    const after = await connection.db!.listCollections().toArray();
    expect(after.map((row) => row.name).sort()).toEqual(
      before.map((row) => row.name).sort(),
    );
    expect(result.slots.map((slot) => slot.operation)).toEqual(
      Array(6).fill('CREATE'),
    );
    expect(JSON.stringify(publicDemoPlan(result))).not.toContain(
      'Admin de prueba',
    );
    expect(JSON.stringify(publicDemoPlan(result))).not.toContain('mongodb://');
    expect(
      await connection
        .db!.collection('branches')
        .find()
        .sort({ _id: 1 })
        .toArray(),
    ).toEqual(branchesBefore);
    expect(await connection.db!.collection('users').find().toArray()).toEqual(
      usersBefore,
    );
  });
  it('rechaza confirmación, base o hash incorrectos antes de escribir', async () => {
    const result = await plan();
    await expect(
      applyDemo(connection, result, {
        ...confirm(result.hash),
        confirm: CLEAN_PHRASE,
      }),
    ).rejects.toThrow();
    await expect(
      applyDemo(connection, result, {
        ...confirm(result.hash),
        database: 'otra',
      }),
    ).rejects.toThrow();
    await expect(
      applyDemo(connection, result, {
        ...confirm(result.hash),
        planHash: 'otro',
      }),
    ).rejects.toThrow();
    await expect(
      cleanDemo(connection, result, confirmClean(result.hash)),
    ).rejects.toThrow();
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(0);
  });
  it('aplica seis EERR exactos, crea backup y repetir apply es no-op', async () => {
    const before = await plan();
    const applied = await applyDemo(connection, before, confirm(before.hash));
    expect(applied.noOp).toBe(false);
    expect(
      (await readDemoBackup(applied.backup!)).snapshots.eerrs,
    ).toHaveLength(0);
    const after = await plan();
    expect(after.slots.every((slot) => slot.operation === 'PRESERVE')).toBe(
      true,
    );
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(6);
    const application = await connection
      .db!.collection<{ _id: string; eerrs: { id: string }[] }>(
        'eerr_demo_applications',
      )
      .findOne({ _id: 'demo-acceptance-v1' });
    expect(
      application?.eerrs.map((row: { id: string }) => row.id).sort(),
    ).toEqual(after.slots.map((slot) => slot.existing!._id).sort());
    const revisions = after.slots.map((slot) => slot.existing!.revision);
    expect(await applyDemo(connection, after, confirm(before.hash))).toEqual({
      noOp: true,
      backup: null,
    });
    expect((await plan()).slots.map((slot) => slot.existing!.revision)).toEqual(
      revisions,
    );
  });
  it('reemplaza un EERR de prueba conservando identidad y timestamps de creación, con backup', async () => {
    const id = randomUUID();
    const createdAt = new Date('2026-08-03T12:00:00Z');
    await connection
      .db!.collection<{
        _id: string;
        branchId: Types.ObjectId;
        year: number;
        month: number;
        revision: number;
        createdAt: Date;
        createdBy: Types.ObjectId;
        note: string;
      }>('eerr')
      .insertOne({
        _id: id,
        branchId: branchIds[2]!,
        year: 2026,
        month: 9,
        revision: 80,
        createdAt,
        createdBy: adminId,
        note: 'prueba previa',
      });
    const before = await plan();
    expect(before.slots[5]!.operation).toBe('REPLACE');
    const applied = await applyDemo(connection, before, confirm(before.hash));
    const backup = await readDemoBackup(applied.backup!);
    expect(backup.snapshots.eerrs).toHaveLength(1);
    expect(backup.snapshots.eerrs[0]!.note).toBe('prueba previa');
    const after = (await plan()).slots[5]!.existing!;
    expect(after._id).toBe(id);
    expect(after.revision).toBe(81);
    expect(after.createdAt).toEqual(createdAt);
    expect(after.createdBy).toEqual(adminId);
    const current = await plan();
    await restoreDemoBackup(connection, current, applied.backup!, {
      database,
      planHash: current.hash,
      confirm: RESTORE_PHRASE,
    });
    const restored = (await plan()).slots[5]!.existing!;
    expect(restored._id).toBe(id);
    expect(restored.revision).toBe(80);
    expect(restored.note).toBe('prueba previa');
  });
  it('restaura transaccionalmente el backup previo a apply', async () => {
    const before = await plan();
    const applied = await applyDemo(connection, before, confirm(before.hash));
    const current = await plan();
    await expect(
      restoreDemoBackup(connection, current, applied.backup!, {
        database,
        planHash: current.hash,
        confirm: CLEAN_PHRASE,
      }),
    ).rejects.toThrow();
    expect(
      await restoreDemoBackup(connection, current, applied.backup!, {
        database,
        planHash: current.hash,
        confirm: RESTORE_PHRASE,
      }),
    ).toEqual({ restoredEerrs: 0 });
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(0);
    expect(
      await connection.db!.collection('eerr_templates').countDocuments(),
    ).toBe(0);
    expect(
      await connection.db!.collection('eerr_concepts').countDocuments(),
    ).toBe(0);
  });
  it('restaura transaccionalmente el backup previo a clean', async () => {
    const before = await plan();
    await applyDemo(connection, before, confirm(before.hash));
    const ready = await plan();
    const cleaned = await cleanDemo(
      connection,
      ready,
      confirmClean(ready.hash),
    );
    const empty = await plan();
    expect(
      await restoreDemoBackup(connection, empty, cleaned.backup, {
        database,
        planHash: empty.hash,
        confirm: RESTORE_PHRASE,
      }),
    ).toEqual({ restoredEerrs: 6 });
    expect(
      (await plan()).slots.every((slot) => slot.operation === 'PRESERVE'),
    ).toBe(true);
  });
  it('preserva otros períodos, sucursales y usuarios; clean solo elimina el manifiesto', async () => {
    const branchesBefore = await connection
      .db!.collection('branches')
      .find()
      .sort({ _id: 1 })
      .toArray();
    const usersBefore = await connection
      .db!.collection('users')
      .find()
      .toArray();
    await connection
      .db!.collection<{
        _id: string;
        branchId: Types.ObjectId;
        year: number;
        month: number;
        revision?: number;
      }>('eerr')
      .insertOne({
        _id: randomUUID(),
        branchId: branchIds[0],
        year: 2026,
        month: 7,
        revision: 5,
      });
    const before = await plan();
    await applyDemo(connection, before, confirm(before.hash));
    const ready = await plan();
    expect(ready.slots.every((slot) => slot.operation === 'PRESERVE')).toBe(
      true,
    );
    const cleaned = await cleanDemo(
      connection,
      ready,
      confirmClean(ready.hash),
    );
    expect(cleaned.deleted).toBe(6);
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(1);
    expect(await connection.db!.collection('branches').countDocuments()).toBe(
      3,
    );
    expect(await connection.db!.collection('users').countDocuments()).toBe(1);
    expect(
      await connection
        .db!.collection('branches')
        .find()
        .sort({ _id: 1 })
        .toArray(),
    ).toEqual(branchesBefore);
    expect(await connection.db!.collection('users').find().toArray()).toEqual(
      usersBefore,
    );
    expect(
      await connection
        .db!.collection('eerr_demo_applications')
        .countDocuments(),
    ).toBe(0);
  });
  it('clean exige registro de aplicación intacto y rechaza una edición posterior', async () => {
    const before = await plan();
    await applyDemo(connection, before, confirm(before.hash));
    const ready = await plan();
    const id = ready.slots[0]!.existing!._id;
    await connection
      .db!.collection<{ _id: string; revision: number }>('eerr')
      .updateOne({ _id: id }, { $inc: { revision: 1 } });
    const changed = await plan();
    await expect(
      cleanDemo(connection, changed, confirmClean(changed.hash)),
    ).rejects.toThrow();
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(6);
    await connection
      .db!.collection<{ _id: string; revision: number }>('eerr')
      .updateOne({ _id: id }, { $inc: { revision: -1 } });
    await connection
      .db!.collection<{ _id: string }>('eerr_demo_applications')
      .deleteOne({ _id: 'demo-acceptance-v1' });
    const unregistered = await plan();
    await expect(
      cleanDemo(connection, unregistered, confirmClean(unregistered.hash)),
    ).rejects.toThrow();
    await expect(
      applyDemo(connection, unregistered, confirm(unregistered.hash)),
    ).rejects.toThrow();
  });
  it('clean restaura plantilla anterior y conserva conceptos previos o compartidos', async () => {
    const oldTemplate = {
      _id: '2026-8',
      version: 7,
      gate: 3,
      categories: [
        {
          code: randomUUID(),
          parentCode: ROOTS[0].code,
          name: 'Categoría previa',
          position: 0,
        },
      ],
    };
    await connection
      .db!.collection<{
        _id: string;
        version: number;
        gate: number;
        categories: unknown[];
      }>('eerr_templates')
      .insertOne(oldTemplate);
    await connection
      .db!.collection<{ _id: string; kind: string; rootCode: string }>(
        'eerr_concepts',
      )
      .insertOne({
        _id: DEMO_CATEGORIES[0]!.code,
        kind: 'CATEGORY',
        rootCode: ROOTS[0].code,
      });
    const before = await plan();
    await applyDemo(connection, before, confirm(before.hash));
    const august = await connection
      .db!.collection<{
        _id: string;
        branchId: Types.ObjectId;
        year: number;
        month: number;
        structure: { structureVersion: number };
      }>('eerr')
      .findOne({ branchId: branchIds[0], year: 2026, month: 8 });
    expect(august?.structure.structureVersion).toBe(8);
    expect(
      (
        await connection
          .db!.collection<{ _id: string; version: number }>('eerr_templates')
          .findOne({ _id: '2026-8' })
      )?.version,
    ).toBe(8);
    await connection
      .db!.collection<{
        _id: string;
        branchId: Types.ObjectId;
        year: number;
        month: number;
        structure: { nodes: { code: string }[] };
      }>('eerr')
      .insertOne({
        _id: randomUUID(),
        branchId: branchIds[0]!,
        year: 2026,
        month: 7,
        structure: { nodes: [{ code: DEMO_ITEMS[0]!.code }] },
      });
    const ready = await plan();
    const cleaned = await cleanDemo(
      connection,
      ready,
      confirmClean(ready.hash),
    );
    expect(
      await connection
        .db!.collection<{ _id: string }>('eerr_templates')
        .findOne({ _id: '2026-8' }),
    ).toEqual(oldTemplate);
    expect(
      await connection
        .db!.collection<{ _id: string }>('eerr_concepts')
        .findOne({ _id: DEMO_CATEGORIES[0]!.code }),
    ).not.toBeNull();
    expect(
      await connection
        .db!.collection<{ _id: string }>('eerr_concepts')
        .findOne({ _id: DEMO_ITEMS[0]!.code }),
    ).not.toBeNull();
    expect(
      await connection
        .db!.collection<{ _id: string }>('eerr_concepts')
        .findOne({ _id: DEMO_ITEMS[1]!.code }),
    ).toBeNull();
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(1);
    const empty = await plan();
    await restoreDemoBackup(connection, empty, cleaned.backup, {
      database,
      planHash: empty.hash,
      confirm: RESTORE_PHRASE,
    });
    expect((await plan()).snapshots.application).not.toBeNull();
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(7);
  });
  it('aborta al cambiar una fuente luego del plan', async () => {
    const before = await plan();
    await connection
      .db!.collection('branches')
      .updateOne(
        { _id: branchIds[0] },
        { $set: { startDate: new Date('2026-02-01T12:00:00Z') } },
      );
    await expect(
      applyDemo(connection, before, confirm(before.hash)),
    ).rejects.toThrow('Una fuente cambió');
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(0);
  });
  it('revierte todo ante fallo intermedio de la transacción', async () => {
    const before = await plan();
    await expect(
      applyDemo(connection, before, confirm(before.hash), () => {
        throw new Error('fallo simulado');
      }),
    ).rejects.toThrow('fallo simulado');
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(0);
    expect(
      await connection.db!.collection('eerr_templates').countDocuments(),
    ).toBe(0);
    expect(
      await connection.db!.collection('eerr_concepts').countDocuments(),
    ).toBe(0);
  });
  it('rechaza sucursal ambigua, inexistente y período previo al inicio', async () => {
    await connection.db!.collection('branches').insertOne({
      _id: new Types.ObjectId(),
      name: ' Calle 13 ',
      startDate: new Date('2026-01-01T12:00:00Z'),
      active: true,
    });
    await expect(plan()).rejects.toThrow('CALLE 13');
    await connection
      .db!.collection('branches')
      .deleteOne({ name: ' Calle 13 ' });
    await connection
      .db!.collection('branches')
      .deleteOne({ _id: branchIds[1] });
    await expect(plan()).rejects.toThrow('CALLE 50');
    await connection.db!.collection('branches').insertOne({
      _id: branchIds[1],
      name: 'CALLE 50',
      startDate: new Date('2026-09-01T12:00:00Z'),
      active: true,
    });
    await expect(plan()).rejects.toThrow('BEFORE_START');
  });
  it('rechaza un período futuro con reloj fijo, sin depender de la fecha real', async () => {
    await expect(
      makeDemoPlan(
        connection,
        database,
        fingerprint,
        undefined,
        new Date('2026-07-15T12:00:00Z'),
      ),
    ).rejects.toThrow('FUTURE');
  });
  it('rechaza otro EERR del mismo mes que compartiría plantilla', async () => {
    await connection
      .db!.collection<{
        _id: string;
        branchId: Types.ObjectId;
        year: number;
        month: number;
      }>('eerr')
      .insertOne({
        _id: randomUUID(),
        branchId: new Types.ObjectId(),
        year: 2026,
        month: 8,
      });
    await expect(plan()).rejects.toThrow('otras sucursales');
  });
  it('bloquea apply si un código del manifiesto ya pertenece a otro período', async () => {
    await connection
      .db!.collection<{
        _id: string;
        branchId: Types.ObjectId;
        year: number;
        month: number;
        structure: { nodes: { code: string }[] };
      }>('eerr')
      .insertOne({
        _id: randomUUID(),
        branchId: branchIds[0]!,
        year: 2026,
        month: 7,
        structure: { nodes: [{ code: DEMO_ITEMS[0]!.code }] },
      });
    const before = await plan();
    expect(
      before.warnings.some((message) => message.includes('otro período')),
    ).toBe(true);
    await expect(
      applyDemo(connection, before, confirm(before.hash)),
    ).rejects.toThrow('fuera de los dos períodos');
    expect(await connection.db!.collection('eerr').countDocuments()).toBe(1);
  });
});

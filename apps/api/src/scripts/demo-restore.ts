import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import {
  DemoPlanError,
  RESTORE_PHRASE,
  makeDemoPlan,
  restoreDemoBackup,
} from './demo-dataset.js';

async function main() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1];
    if (
      !key ||
      !value ||
      !['--backup', '--database', '--plan-hash', '--confirm'].includes(key) ||
      options[key]
    )
      throw new DemoPlanError('Opciones de restauración inválidas');
    options[key] = value;
  }
  if (
    Object.keys(options).length !== 4 ||
    options['--confirm'] !== RESTORE_PHRASE
  )
    throw new DemoPlanError(
      'Se requiere confirmación explícita de restauración',
    );
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new DemoPlanError(
      'MONGODB_URI debe entregarse mediante el entorno seguro',
    );
  let destination: URL;
  try {
    destination = new URL(uri);
  } catch {
    throw new DemoPlanError('URI MongoDB inválida');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(destination.protocol))
    throw new DemoPlanError('Protocolo MongoDB inválido');
  const database = decodeURIComponent(destination.pathname.replace(/^\//, ''));
  if (!database || database !== options['--database'])
    throw new DemoPlanError('La base de destino no coincide');
  const fingerprint = createHash('sha256')
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
    const plan = await makeDemoPlan(connection, database, fingerprint);
    const result = await restoreDemoBackup(
      connection,
      plan,
      options['--backup']!,
      {
        database,
        planHash: options['--plan-hash'],
        confirm: options['--confirm'],
      },
    );
    console.log(JSON.stringify({ restored: true, ...result }));
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof DemoPlanError
      ? error.message
      : 'Falló la restauración; se ocultó el detalle para proteger la configuración.',
  );
  process.exitCode = 1;
});

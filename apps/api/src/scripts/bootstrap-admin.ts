import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { UsersService } from '../users/users.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const users = app.get(UsersService);
  if (await users.hasAdmin())
    throw new Error('Ya existe un administrador; el bootstrap fue rechazado.');
  const name = process.env.BOOTSTRAP_ADMIN_NAME;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!name || !email || !password) {
    throw new Error(
      'Faltan variables BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL o BOOTSTRAP_ADMIN_PASSWORD.',
    );
  }
  if (password.length < 12)
    throw new Error(
      'La contraseña temporal debe tener al menos 12 caracteres.',
    );
  const user = await users.create({
    name,
    email,
    password,
    isAdmin: true,
    branchAccesses: [],
  });
  console.log(`Administrador inicial creado para ${user.email}.`);
} finally {
  await app.close();
}

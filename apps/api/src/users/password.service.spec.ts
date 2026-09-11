import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  it('genera un hash y valida la contraseña correcta', async () => {
    const service = new PasswordService();
    const passwordHash = await service.hash('una-clave-segura');
    expect(passwordHash).not.toBe('una-clave-segura');
    await expect(
      service.verify('una-clave-segura', passwordHash),
    ).resolves.toBe(true);
    await expect(service.verify('otra-clave', passwordHash)).resolves.toBe(
      false,
    );
  });
});

import { SchemaFactory } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import { BranchRole } from '../user-role.js';

describe('UserSchema', () => {
  let userModule: typeof import('./user.schema.js');
  let UserSchema: Schema;

  beforeAll(async () => {
    // tsx no emite design:type. Simularlo también si Vitest cambia su transformador.
    const getMetadata = Reflect.getMetadata;
    const metadata = vi.spyOn(Reflect, 'getMetadata').mockImplementation(
      (key, target, propertyKey) =>
        key === 'design:type'
          ? undefined
          : getMetadata(key, target, propertyKey!),
    );
    try {
      userModule = await import('./user.schema.js');
      UserSchema = userModule.UserSchema;
    } finally {
      metadata.mockRestore();
    }
  });

  it('se inicializa sin depender de metadatos de tipos emitidos por TypeScript', () => {
    expect(UserSchema).toBeInstanceOf(Schema);
    expect(() => SchemaFactory.createForClass(userModule.User)).not.toThrow();
  });

  it.each([
    ['name', 'String'],
    ['email', 'String'],
    ['passwordHash', 'String'],
    ['isAdmin', 'Boolean'],
    ['active', 'Boolean'],
    ['mustChangePassword', 'Boolean'],
    ['authVersion', 'Number'],
    ['adminStatusGuardVersion', 'Number'],
  ])('declara el campo %s como %s', (field, type) => {
    expect(UserSchema.path(field)?.instance).toBe(type);
  });

  it('normaliza la versión de sesión para usuarios nuevos y oculta el guard administrativo', () => {
    expect(UserSchema.path('authVersion').options.default).toBe(0);
    expect(UserSchema.path('adminStatusGuardVersion').options.select).toBe(false);
  });

  it('conserva los accesos como subdocumentos con identificador y rol de texto', () => {
    const accesses = UserSchema.path<Schema.Types.DocumentArray>('branchAccesses');

    expect(accesses).toBeInstanceOf(Schema.Types.DocumentArray);
    expect(accesses.schema.path('branchId')?.instance).toBe('String');
    expect(accesses.schema.path('role')?.instance).toBe('String');
    expect(accesses.schema.path('role').options.enum).toEqual(BranchRole);
  });
});

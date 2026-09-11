import 'reflect-metadata';
import { Mongoose, Schema } from 'mongoose';

describe('BranchSchema en runtime', () => {
  it('construye todos los campos sin inferencia de design:type y mantiene índices únicos', async () => {
    const original = Reflect.getMetadata;
    const spy = vi
      .spyOn(Reflect, 'getMetadata')
      .mockImplementation((key, target, propertyKey) =>
        key === 'design:type' ? undefined : original(key, target, propertyKey!),
      );
    try {
      const { BranchSchema } = await import('./branch.schema.js');
      expect(BranchSchema).toBeInstanceOf(Schema);
      for (const [field, type] of Object.entries({
        code: 'String',
        name: 'String',
        normalizedName: 'String',
        startDate: 'Date',
        active: 'Boolean',
        createdAt: 'Date',
        updatedAt: 'Date',
      })) {
        expect(BranchSchema.path(field)?.instance).toBe(type);
      }
      expect(BranchSchema.indexes()).toEqual(
        expect.arrayContaining([
          [{ code: 1 }, expect.objectContaining({ unique: true })],
          [{ normalizedName: 1 }, expect.objectContaining({ unique: true })],
        ]),
      );
      expect(BranchSchema.path('normalizedName').options.select).toBe(false);
      expect(BranchSchema.path('code').options.immutable).toBe(true);
      const Model = new Mongoose().model('BranchRuntime', BranchSchema);
      const branch = new Model({ name: 'Centro', normalizedName: 'centro' });
      await expect(branch.validate()).resolves.toBeUndefined();
      expect(branch.startDate).toEqual(branch.createdAt);
      expect(branch.active).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

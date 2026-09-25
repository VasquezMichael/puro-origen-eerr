import 'reflect-metadata';
import { Mongoose, Schema, Types } from 'mongoose';

describe('EerrSchema sin metadatos inferidos ni conexión', () => {
  it('construye el esquema, genera UUID y preserva identidad e índice compuesto', async () => {
    const original = Reflect.getMetadata;
    const spy = vi
      .spyOn(Reflect, 'getMetadata')
      .mockImplementation((key, target, propertyKey) =>
        key === 'design:type' ? undefined : original(key, target, propertyKey!),
      );
    try {
      const { EerrSchema } = await import('./eerr.schema.js');
      expect(EerrSchema).toBeInstanceOf(Schema);
      expect(EerrSchema.options.collection).toBe('eerr');
      for (const [field, type] of Object.entries({
        _id: 'String',
        branchId: 'ObjectId',
        year: 'Number',
        month: 'Number',
        loadStatus: 'String',
        createdBy: 'ObjectId',
        createdAt: 'Date',
        updatedAt: 'Date',
        salesGoal: 'Embedded',
      })) {
        expect(EerrSchema.path(field)?.instance).toBe(type);
      }
      expect(EerrSchema.indexes()).toContainEqual([
        { branchId: 1, year: -1, month: -1 },
        expect.objectContaining({ unique: true }),
      ]);
      const Model = new Mongoose().model('EerrRuntime', EerrSchema);
      const branchId = new Types.ObjectId();
      const input = {
        branchId,
        year: 2026,
        month: 8,
        createdBy: new Types.ObjectId(),
      };
      const row = new Model(input);
      await expect(row.validate()).resolves.toBeUndefined();
      expect(row._id).toMatch(
        /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/,
      );
      expect(new Model(input)._id).not.toBe(row._id);
      expect(row.loadStatus).toBe('SIN_CARGAR');
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.toObject()).not.toHaveProperty('values');
      expect(row.toObject()).not.toHaveProperty('salesGoal');
      const withGoal = new Model({
        ...input,
        salesGoal: {
          mode: 'NET_MARGIN_PERCENT',
          value: Types.Decimal128.fromString('10.0000'),
          updatedAt: new Date('2026-09-15T12:00:00Z'),
          updatedBy: input.createdBy.toString(),
        },
      });
      await expect(withGoal.validate()).resolves.toBeUndefined();
      expect(withGoal.salesGoal?.value.toString()).toBe('10.0000');
      expect(withGoal.salesGoal?.value._bsontype).toBe('Decimal128');
      const id = row._id;
      row.isNew = false;
      row._id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      row.branchId = new Types.ObjectId();
      row.year = 2020;
      row.month = 1;
      expect(row._id).toBe(id);
      expect(row.branchId).toEqual(branchId);
      expect(row.year).toBe(2026);
      expect(row.month).toBe(8);
      await expect(
        new Model({ ...input, month: 13 }).validate(),
      ).rejects.toThrow();
      await expect(
        new Model({ ...input, year: 2026.5 }).validate(),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

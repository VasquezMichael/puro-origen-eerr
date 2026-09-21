import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createConnection, Types, type Schema } from 'mongoose';
import { initialNodes, emptyAmount } from '@puro-origen/domain';

describe('esquemas EP-04A sin metadatos, entorno ni MongoDB', () => {
  it('declara tipos explícitos, embebe Decimal128 y serializa sin objetos BSON', async () => {
    const metadata = vi
      .spyOn(Reflect, 'getMetadata')
      .mockImplementation(() => undefined);
    try {
      const { EerrSchema } = await import('./eerr.schema.js');
      const {
        StructureSchema,
        NodeSchema,
        AmountSchema,
        TemplateSchema,
        ConceptSchema,
        PreviewSchema,
        storedStructure,
        publicStructure,
      } = await import('./structure.schema.js');
      expect(EerrSchema.path('revision').instance).toBe('Number');
      expect(EerrSchema.path('note').instance).toBe('String');
      expect(StructureSchema.path('initializedAt').instance).toBe('Date');
      for (const field of ['nodeId', 'code', 'name', 'kind', 'parentId'])
        expect(NodeSchema.path(field).instance).toBe('String');
      expect(AmountSchema.path('value').instance).toBe('Decimal128');
      expect(NodeSchema.path('quantityEnabled').instance).toBe('Boolean');
      expect(NodeSchema.path('note').instance).toBe('String');
      for (const key of ['state', 'at', 'by'])
        expect(
          NodeSchema.path<Schema.Types.Subdocument>('archive').schema.path(key)
            .instance,
        ).toBe('String');
      expect(
        NodeSchema.path<Schema.Types.Subdocument>('quantity').schema.path(
          'value',
        ).instance,
      ).toBe('String');
      for (const schema of [
        TemplateSchema,
        ConceptSchema,
        PreviewSchema,
      ] as Schema[])
        expect(schema.path('_id').instance).toBe('String');
      expect(PreviewSchema.indexes()).toContainEqual([
        { expiresAt: 1 },
        { expireAfterSeconds: 0 },
      ]);
      const structure = {
        schemaVersion: 1,
        structureVersion: 1,
        initializedAt: '2026-09-15T12:00:00.000Z',
        initializedBy: '222222222222222222222222',
        nodes: initialNodes([], randomUUID),
      };
      structure.nodes.push({
        nodeId: randomUUID(),
        code: randomUUID(),
        name: 'Ventas',
        parentId: structure.nodes[0].nodeId,
        position: 0,
        kind: 'ITEM',
        quantity: { state: 'CARGADO', value: '999999999999' },
        note: 'Primera\nSegunda',
        archive: {
          state: 'ARCHIVED',
          at: '2026-09-15T12:00:00.000Z',
          by: structure.initializedBy,
        },
        amount: {
          ...emptyAmount(),
          state: 'CARGADO',
          input: '12,30',
          value: '12.30',
        },
      });
      const stored = storedStructure(structure);
      expect(stored.nodes[3].amount!.value).toBeInstanceOf(Types.Decimal128);
      const output = publicStructure(stored)!;
      expect(output.nodes[3].amount!.value).toBe('12.30');
      expect(output.nodes[3].quantity).toEqual({
        state: 'CARGADO',
        value: '999999999999',
      });
      expect(output.nodes[3].note).toBe('Primera\nSegunda');
      expect(output.nodes[3].archive).toEqual(structure.nodes[3].archive);
      expect(output.nodes[0]).not.toHaveProperty('archive');
      expect(JSON.stringify(output)).not.toContain('$numberDecimal');
      const connection = createConnection();
      const model = connection.model('OfflineStructure', EerrSchema);
      const doc = new model({
        branchId: '123456789012345678901234',
        year: 2026,
        month: 9,
        createdBy: structure.initializedBy,
        note: 'General\nEERR',
        structure: stored,
      });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.structure!.nodes[3].amount!.value!.toString()).toBe('12.30');
      expect(doc.structure!.nodes[3].quantity!.value).toBe('999999999999');
      expect(doc.note).toBe('General\nEERR');
      await connection.close();
    } finally {
      metadata.mockRestore();
    }
  });
});

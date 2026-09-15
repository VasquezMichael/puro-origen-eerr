import { Schema, Types } from 'mongoose';
import type {
  AmountCell,
  EerrStructure,
  StructureNode,
  CategoryConcept,
} from '@puro-origen/domain';

export type StoredNode = Omit<StructureNode, 'amount'> & {
  amount?: Omit<AmountCell, 'value'> & { value: Types.Decimal128 | null };
};
export type StoredStructure = Omit<EerrStructure, 'nodes' | 'initializedAt'> & {
  nodes: StoredNode[];
  initializedAt: Date;
};
const options = { _id: false, strict: 'throw' as const };
export const AmountSchema: Schema = new Schema(
  {
    state: { type: String, enum: ['SIN_CARGAR', 'CARGADO'], required: true },
    input: { type: String, default: null },
    value: { type: Schema.Types.Decimal128, default: null },
    currency: { type: String, enum: ['ARS'], required: true },
    scale: { type: Number, enum: [2], required: true },
  },
  options,
);
export const NodeSchema = new Schema<StoredNode>(
  {
    nodeId: { type: String, required: true },
    code: { type: String, required: true },
    parentId: { type: String, default: null },
    position: { type: Number, required: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['BLOCK', 'CATEGORY', 'ITEM'], required: true },
    amount: { type: AmountSchema, default: undefined },
    quantityEnabled: { type: Boolean, default: undefined },
    unit: { type: String, default: undefined },
  },
  options,
);
export const StructureSchema = new Schema<StoredStructure>(
  {
    schemaVersion: { type: Number, required: true },
    structureVersion: { type: Number, required: true },
    initializedAt: { type: Date, required: true },
    initializedBy: { type: String, required: true },
    nodes: { type: [NodeSchema], required: true },
  },
  options,
);
const CategorySchema = new Schema<CategoryConcept>(
  {
    code: { type: String, required: true },
    parentCode: { type: String, required: true },
    name: { type: String, required: true },
    position: { type: Number, required: true },
  },
  options,
);
export type MonthlyTemplate = {
  _id: string;
  version: number;
  gate: number;
  categories: CategoryConcept[];
};
export const TemplateSchema = new Schema<MonthlyTemplate>(
  {
    _id: { type: String, required: true },
    version: { type: Number, default: 0 },
    gate: { type: Number, default: 0 },
    categories: { type: [CategorySchema], default: [] },
  },
  { collection: 'eerr_templates', versionKey: false, strict: 'throw' },
);
export type Concept = {
  _id: string;
  kind: 'CATEGORY' | 'ITEM';
  rootCode: string;
};
export const ConceptSchema = new Schema<Concept>(
  {
    _id: { type: String, required: true },
    kind: { type: String, enum: ['CATEGORY', 'ITEM'], required: true },
    rootCode: { type: String, required: true },
  },
  { collection: 'eerr_concepts', versionKey: false, strict: 'throw' },
);
export type GlobalPreview = {
  _id: string;
  userId: string;
  eerrId: string;
  year: number;
  month: number;
  expiresAt: Date;
  operation: 'CREATE' | 'RENAME';
  name: string;
  parentCode: string;
  code: string;
  templateVersion: number;
  revisions: { id: string; revision: number }[];
};
export const PreviewSchema = new Schema<GlobalPreview>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    eerrId: { type: String, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    operation: { type: String, enum: ['CREATE', 'RENAME'], required: true },
    name: { type: String, required: true },
    parentCode: { type: String, required: true },
    code: { type: String, required: true },
    templateVersion: { type: Number, required: true },
    revisions: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            revision: { type: Number, required: true },
          },
          options,
        ),
      ],
      required: true,
    },
  },
  { collection: 'eerr_previews', versionKey: false, strict: 'throw' },
);

export function publicStructure(
  stored: StoredStructure | null | undefined,
): EerrStructure | null {
  if (!stored) return null;
  return {
    schemaVersion: stored.schemaVersion,
    structureVersion: stored.structureVersion,
    initializedAt: stored.initializedAt.toISOString(),
    initializedBy: stored.initializedBy,
    nodes: stored.nodes.map((node) => ({
      nodeId: node.nodeId,
      code: node.code,
      parentId: node.parentId,
      position: node.position,
      name: node.name,
      kind: node.kind,
      ...(node.kind === 'ITEM'
        ? {
            quantityEnabled: node.quantityEnabled ?? false,
            unit: node.unit ?? null,
            amount: {
              state: node.amount!.state,
              input: node.amount!.input,
              currency: node.amount!.currency,
              scale: node.amount!.scale,
              value:
                node.amount!.value === null
                  ? null
                  : node.amount!.value.toString(),
            },
          }
        : {}),
    })),
  };
}
export function storedStructure(structure: EerrStructure): StoredStructure {
  return {
    ...structure,
    initializedAt: new Date(structure.initializedAt),
    nodes: structure.nodes.map((node) => ({
      ...node,
      ...(node.amount
        ? {
            amount: {
              ...node.amount,
              value:
                node.amount.value === null
                  ? null
                  : Types.Decimal128.fromString(node.amount.value),
            },
          }
        : {}),
    })) as StoredNode[],
  };
}

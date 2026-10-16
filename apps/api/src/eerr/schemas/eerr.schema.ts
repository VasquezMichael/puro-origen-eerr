import { randomUUID } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  type HydratedDocument,
  Schema as MongoSchema,
  type Types,
} from 'mongoose';
import { StructureSchema, type StoredStructure } from './structure.schema.js';
import { SalesGoalSchema, type StoredSalesGoal } from './sales-goal.schema.js';
import type { EerrLifecycleStatus } from '@puro-origen/shared-types';

export const EERR_LIFECYCLE_STATUSES = [
  'OPEN',
  'CLOSED',
] as const satisfies readonly EerrLifecycleStatus[];

export enum EerrLoadStatus {
  SIN_CARGAR = 'SIN_CARGAR',
  PARCIAL = 'PARCIAL',
  CARGADO = 'CARGADO',
}

@Schema({ collection: 'eerr', timestamps: true })
export class Eerr {
  @Prop({ type: String, default: undefined })
  note?: string;

  @Prop({ type: Number, default: 0, min: 0, validate: Number.isSafeInteger })
  revision!: number;

  @Prop({ type: StructureSchema, default: null })
  structure!: StoredStructure | null;

  @Prop({ type: SalesGoalSchema, default: undefined })
  salesGoal?: StoredSalesGoal | null;

  @Prop({ type: String, default: randomUUID, immutable: true })
  _id!: string;

  @Prop({
    type: MongoSchema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    immutable: true,
  })
  branchId!: Types.ObjectId;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: 9999,
    immutable: true,
    validate: Number.isInteger,
  })
  year!: number;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: 12,
    immutable: true,
    validate: Number.isInteger,
  })
  month!: number;

  @Prop({
    type: String,
    enum: EerrLoadStatus,
    default: EerrLoadStatus.SIN_CARGAR,
    required: true,
  })
  loadStatus!: EerrLoadStatus;

  @Prop({
    type: String,
    enum: EERR_LIFECYCLE_STATUSES,
    default: 'OPEN',
    required: true,
  })
  lifecycleStatus!: EerrLifecycleStatus;

  @Prop({ type: Boolean, default: false, required: true })
  everClosed!: boolean;

  @Prop({ type: Date, default: undefined })
  closedAt?: Date | null;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'User', default: undefined })
  closedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: undefined })
  deletedAt?: Date | null;

  @Prop({ type: MongoSchema.Types.ObjectId, ref: 'User', default: undefined })
  deletedBy?: Types.ObjectId | null;

  @Prop({
    type: MongoSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  })
  createdBy!: Types.ObjectId;

  @Prop({ type: Date, default: Date.now, immutable: true })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export type EerrDocument = HydratedDocument<Eerr>;
export const EerrSchema = SchemaFactory.createForClass(Eerr);
// { deletedAt: null } incluye documentos legacy donde el campo no existe.
// En entornos existentes, sustituir el índice global bajo una ventana sin escrituras.
EerrSchema.index(
  { branchId: 1, year: -1, month: -1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
    name: 'eerr_active_branch_period_unique',
  },
);
// Dashboard y publicación mensual consultan un período para muchas sucursales.
EerrSchema.index({ year: 1, month: 1, branchId: 1 });

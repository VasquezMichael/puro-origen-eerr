import { randomUUID } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongoSchema, Types } from 'mongoose';
import { StructureSchema, type StoredStructure } from './structure.schema.js';

export enum EerrLoadStatus {
  SIN_CARGAR = 'SIN_CARGAR',
  PARCIAL = 'PARCIAL',
  CARGADO = 'CARGADO',
}

@Schema({ collection: 'eerr', timestamps: true })
export class Eerr {
  @Prop({ type: Number, default: 0, min: 0, validate: Number.isSafeInteger })
  revision!: number;

  @Prop({ type: StructureSchema, default: null })
  structure!: StoredStructure | null;

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
EerrSchema.index({ branchId: 1, year: -1, month: -1 }, { unique: true });

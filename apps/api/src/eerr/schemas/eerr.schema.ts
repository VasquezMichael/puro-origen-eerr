import { randomUUID } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongoSchema, Types } from 'mongoose';

export enum EerrLoadStatus {
  SIN_CARGAR = 'SIN_CARGAR',
}

@Schema({ collection: 'eerr', timestamps: true })
export class Eerr {
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

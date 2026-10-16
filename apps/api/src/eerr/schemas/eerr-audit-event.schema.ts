import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Schema as MongoSchema,
  type HydratedDocument,
  type Types,
} from 'mongoose';
import type {
  EerrAuditEventType,
  EerrLifecycleStatus,
} from '@puro-origen/shared-types';
import { EERR_LIFECYCLE_STATUSES } from './eerr.schema.js';

export const EERR_AUDIT_EVENT_TYPES = [
  'EERR_CLOSED',
  'EERR_REOPENED',
  'EERR_DELETED',
  'POST_CLOSE_EDIT',
] as const satisfies readonly EerrAuditEventType[];

@Schema({ _id: false, strict: true })
export class EerrAuditMetadata {
  @Prop({ type: String, enum: EERR_LIFECYCLE_STATUSES })
  previousLifecycleStatus?: EerrLifecycleStatus;

  @Prop({ type: String, enum: EERR_LIFECYCLE_STATUSES })
  newLifecycleStatus?: EerrLifecycleStatus;

  @Prop({ type: Number, min: 0, validate: Number.isSafeInteger })
  previousRevision?: number;

  @Prop({ type: Number, min: 0, validate: Number.isSafeInteger })
  newRevision?: number;

  @Prop({ type: String, maxlength: 80 })
  changedArea?: string;
}

const EerrAuditMetadataSchema = SchemaFactory.createForClass(EerrAuditMetadata);

@Schema({ collection: 'eerr_audit_events', versionKey: false, strict: true })
export class EerrAuditEventRecord {
  @Prop({
    type: String,
    enum: EERR_AUDIT_EVENT_TYPES,
    required: true,
    immutable: true,
  })
  eventType!: EerrAuditEventType;

  @Prop({ type: String, required: true, immutable: true })
  eerrId!: string;

  @Prop({
    type: MongoSchema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    immutable: true,
  })
  branchId!: Types.ObjectId;

  @Prop({
    type: MongoSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  })
  actorUserId!: Types.ObjectId;

  @Prop({ type: Date, required: true, immutable: true })
  occurredAt!: Date;

  @Prop({
    type: Number,
    required: true,
    min: 0,
    validate: Number.isSafeInteger,
    immutable: true,
  })
  revision!: number;

  @Prop({ type: EerrAuditMetadataSchema, default: undefined, immutable: true })
  metadata?: EerrAuditMetadata;
}

export type EerrAuditEventDocument = HydratedDocument<EerrAuditEventRecord>;
export const EerrAuditEventSchema =
  SchemaFactory.createForClass(EerrAuditEventRecord);
EerrAuditEventSchema.index({ eerrId: 1, occurredAt: 1, _id: 1 });

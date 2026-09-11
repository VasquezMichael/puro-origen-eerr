import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Branch {
  @Prop({
    type: String,
    required: true,
    unique: true,
    immutable: true,
    default: () => `SUC-${randomUUID()}`,
  })
  code!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true, unique: true, select: false })
  normalizedName!: string;

  @Prop({ type: Date, default: Date.now, immutable: true })
  createdAt!: Date;

  @Prop({
    type: Date,
    required: true,
    default: function (this: Branch) {
      return this.createdAt;
    },
  })
  startDate!: Date;

  @Prop({ type: Boolean, default: true, required: true })
  active!: boolean;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export type BranchDocument = HydratedDocument<Branch>;
export const BranchSchema = SchemaFactory.createForClass(Branch);

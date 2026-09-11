import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BranchRole } from '../user-role.js';

@Schema({ _id: false })
export class BranchAccess {
  @Prop({ type: String, required: true, trim: true })
  branchId!: string;

  @Prop({ type: String, required: true, enum: BranchRole })
  role!: BranchRole;
}

const BranchAccessSchema = SchemaFactory.createForClass(BranchAccess);

@Schema({ timestamps: true })
export class User {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: Boolean, default: false })
  isAdmin!: boolean;

  @Prop({ type: [BranchAccessSchema], default: [] })
  branchAccesses!: BranchAccess[];

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  @Prop({ type: Boolean, default: true })
  mustChangePassword!: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BranchRole } from '../user-role.js';

@Schema({ _id: false })
export class BranchAccess {
  @Prop({ required: true, trim: true })
  branchId!: string;

  @Prop({ required: true, enum: BranchRole })
  role!: BranchRole;
}

const BranchAccessSchema = SchemaFactory.createForClass(BranchAccess);

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ default: false })
  isAdmin!: boolean;

  @Prop({ type: [BranchAccessSchema], default: [] })
  branchAccesses!: BranchAccess[];

  @Prop({ default: true })
  active!: boolean;

  @Prop({ default: true })
  mustChangePassword!: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

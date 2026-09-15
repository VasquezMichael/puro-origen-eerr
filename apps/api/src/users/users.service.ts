import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto.js';
import { PasswordService } from './password.service.js';
import { User, UserDocument } from './schemas/user.schema.js';
import { BranchesService } from '../branches/branches.service.js';
import { requireMongoId } from '../branches/mongo-id.pipe.js';
import type { BranchAccessDto } from './dto/create-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly passwords: PasswordService,
    private readonly branches: BranchesService,
  ) {}

  async create(input: CreateUserDto) {
    const accesses = input.branchAccesses ?? [];
    const ids = await this.branches.validateAccesses(accesses);
    const email = input.email.trim().toLowerCase();
    if (await this.userModel.exists({ email })) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
    const created = await this.userModel.create({
      name: input.name.trim(),
      email,
      passwordHash: await this.passwords.hash(input.password),
      isAdmin: input.isAdmin ?? false,
      branchAccesses: accesses.map((access, index) => ({
        branchId: ids[index],
        role: access.role,
      })),
      mustChangePassword: true,
    });
    return this.toPublicUser(created);
  }

  findByEmailWithPassword(email: string) {
    return this.userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  async assignBranchAccesses(id: string, accesses: BranchAccessDto[]) {
    requireMongoId(id);
    const ids = await this.branches.validateAccesses(accesses);
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            branchAccesses: accesses.map((access, index) => ({
              branchId: ids[index],
              role: access.role,
            })),
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.toPublicUser(user);
  }

  findActiveById(id: string) {
    return this.userModel.findOne({ _id: id, active: true }).exec();
  }

  findActiveByIdWithPassword(id: string) {
    return this.userModel
      .findOne({ _id: id, active: true })
      .select('+passwordHash')
      .exec();
  }

  async list() {
    const users = await this.userModel.find().sort({ name: 1 }).exec();
    return users.map((user) => this.toPublicUser(user));
  }

  hasAdmin() {
    return this.userModel.exists({ isAdmin: true });
  }

  async resetPassword(id: string, password: string, requireChange = true) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Identificador de usuario inválido');
    }
    const updated = await this.userModel.findByIdAndUpdate(
      id,
      {
        passwordHash: await this.passwords.hash(password),
        mustChangePassword: requireChange,
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Usuario no encontrado');
    return this.toPublicUser(updated);
  }

  toPublicUser(user: UserDocument) {
    return {
      id: user.id as string,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      branchAccesses: user.branchAccesses,
      active: user.active,
      mustChangePassword: user.mustChangePassword,
    };
  }
}

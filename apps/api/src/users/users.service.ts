import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto.js';
import { PasswordService } from './password.service.js';
import { User, UserDocument } from './schemas/user.schema.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly passwords: PasswordService,
  ) {}

  async create(input: CreateUserDto) {
    const email = input.email.trim().toLowerCase();
    if (await this.userModel.exists({ email })) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
    const created = await this.userModel.create({
      name: input.name.trim(),
      email,
      passwordHash: await this.passwords.hash(input.password),
      isAdmin: input.isAdmin ?? false,
      branchAccesses: input.branchAccesses ?? [],
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

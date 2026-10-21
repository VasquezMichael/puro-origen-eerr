import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type Connection, type Model, Types } from 'mongoose';
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
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(input: CreateUserDto) {
    const accesses = input.branchAccesses ?? [];
    const ids = await this.branches.validateAccesses(accesses);
    const email = input.email.trim().toLowerCase();
    if (await this.userModel.exists({ email })) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
    try {
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
    } catch (error) {
      if (this.isDuplicateEmail(error))
        throw new ConflictException('Ya existe un usuario con ese email');
      throw error;
    }
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
        $set: {
          passwordHash: await this.passwords.hash(password),
          mustChangePassword: requireChange,
        },
        $inc: { authVersion: 1 },
      },
      { new: true },
    ).exec();
    if (!updated) throw new NotFoundException('Usuario no encontrado');
    return this.toPublicUser(updated);
  }

  async changeOwnPassword(id: string, previousHash: string, password: string) {
    const updated = await this.userModel
      .findOneAndUpdate(
        { _id: id, active: true, passwordHash: previousHash },
        {
          $set: {
            passwordHash: await this.passwords.hash(password),
            mustChangePassword: false,
          },
          $inc: { authVersion: 1 },
        },
        { new: true },
      )
      .exec();
    if (!updated)
      throw new UnauthorizedException('La contraseña actual ya no está vigente');
    return updated;
  }

  async setStatus(id: string, active: boolean, actorId: string) {
    const targetId = requireMongoId(id);
    if (!active && targetId === actorId.toLowerCase())
      throw new ConflictException({
        statusCode: 409,
        code: 'USER_SELF_DEACTIVATION_NOT_ALLOWED',
        message: 'No podés desactivar tu propio usuario',
      });
    try {
      return await this.connection.transaction(async (session) => {
        const user = await this.userModel.findById(targetId).session(session).exec();
        if (!user) throw new NotFoundException('Usuario no encontrado');
        if (user.active === active) return this.toPublicUser(user);

        if (!active && user.isAdmin) {
          // Todas las desactivaciones de Admin escriben el mismo documento
          // en la transacción. MongoDB aborta/reintenta una de dos carreras.
          const guard = await this.userModel
            .findOne({ isAdmin: true, active: true })
            .sort({ _id: 1 })
            .session(session)
            .exec();
          if (!guard) throw new ServiceUnavailableException('Estado de administradores inconsistente');
          const reserved = await this.userModel.updateOne(
            { _id: guard._id, active: true },
            { $inc: { adminStatusGuardVersion: 1 } },
            { session },
          );
          if (reserved.matchedCount !== 1)
            throw new ConflictException('El estado de administradores cambió; reintentá');
          const count = await this.userModel
            .countDocuments({ isAdmin: true, active: true })
            .session(session)
            .exec();
          if (count <= 1)
            throw new ConflictException({
              statusCode: 409,
              code: 'LAST_ACTIVE_ADMIN',
              message: 'Debe permanecer al menos un administrador activo',
            });
        }
        const updated = await this.userModel
          .findOneAndUpdate(
            { _id: targetId, active: !active },
            {
              $set: { active },
              ...(!active && { $inc: { authVersion: 1 } }),
            },
            { new: true, runValidators: true, session },
          )
          .exec();
        if (!updated)
          throw new ConflictException('El estado del usuario cambió; actualizá la lista');
        return this.toPublicUser(updated);
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === 20 || error.code === 263)
          throw new ServiceUnavailableException('La operación requiere transacciones de MongoDB');
        if (error.code === 112)
          throw new ConflictException('El estado de usuarios cambió; reintentá');
      }
      throw error;
    }
  }

  private isDuplicateEmail(error: unknown) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000)
      return false;
    const pattern = 'keyPattern' in error ? error.keyPattern : undefined;
    return typeof pattern === 'object' && pattern !== null && 'email' in pattern;
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

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Branch, BranchSchema } from './schemas/branch.schema.js';
import { BranchesService } from './branches.service.js';

// Compartido por Usuarios y las rutas de sucursales, sin importar Autenticación.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Branch.name, schema: BranchSchema }]),
  ],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesPersistenceModule {}

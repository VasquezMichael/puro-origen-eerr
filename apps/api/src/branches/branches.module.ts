import { Module } from '@nestjs/common';
import { BranchesPersistenceModule } from './branches-persistence.module.js';
import { BranchesController } from './branches.controller.js';

@Module({
  imports: [BranchesPersistenceModule],
  controllers: [BranchesController],
})
export class BranchesModule {}

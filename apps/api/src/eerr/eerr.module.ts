import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesPersistenceModule } from '../branches/branches-persistence.module.js';
import { EerrController } from './eerr.controller.js';
import { EerrService } from './eerr.service.js';
import { EerrClock } from './eerr-clock.js';
import { Eerr, EerrSchema } from './schemas/eerr.schema.js';
import { StructureController } from './structure.controller.js';
import { StructureService } from './structure.service.js';
import { StructureRepository } from './structure.repository.js';

@Module({
  imports: [
    BranchesPersistenceModule,
    MongooseModule.forFeature([{ name: Eerr.name, schema: EerrSchema }]),
  ],
  controllers: [EerrController, StructureController],
  providers: [EerrService, EerrClock, StructureService, StructureRepository],
})
export class EerrModule {}

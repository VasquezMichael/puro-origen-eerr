import { CompletePendingController } from './complete-pending.controller.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';
import { CompletePendingService } from './complete-pending.service.js';
import { ImportController } from './import/import.controller.js';
import { ImportService } from './import/import.service.js';
import { ImportToken } from './import/import-token.js';
import { CloneController } from './clone.controller.js';
import { CloneService } from './clone.service.js';
import { ClonePreviewToken } from './clone-preview-token.js';
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
  controllers: [
    AnalysisController,
    CompletePendingController,
    ImportController,
    EerrController,
    StructureController,
    CloneController,
  ],
  providers: [
    AnalysisService,
    CompletePendingService,
    ImportService,
    ImportToken,
    EerrService,
    EerrClock,
    StructureService,
    StructureRepository,
    CloneService,
    ClonePreviewToken,
  ],
})
export class EerrModule {}

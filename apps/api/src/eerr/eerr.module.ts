import { CompletePendingController } from './complete-pending.controller.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { SalesGoalController } from './sales-goal.controller.js';
import { SalesGoalService } from './sales-goal.service.js';
import { CompletePendingService } from './complete-pending.service.js';
import { ImportController } from './import/import.controller.js';
import { ImportService } from './import/import.service.js';
import { ImportToken } from './import/import-token.js';
import { ExportController } from './export/export.controller.js';
import { ExportService } from './export/export.service.js';
import { CloneController } from './clone.controller.js';
import { CloneService } from './clone.service.js';
import { ClonePreviewToken } from './clone-preview-token.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesPersistenceModule } from '../branches/branches-persistence.module.js';
import { UsersModule } from '../users/users.module.js';
import { EerrController } from './eerr.controller.js';
import { EerrService } from './eerr.service.js';
import { EerrLifecycleService } from './eerr-lifecycle.service.js';
import { EerrClock } from './eerr-clock.js';
import { Eerr, EerrSchema } from './schemas/eerr.schema.js';
import {
  EerrAuditEventRecord,
  EerrAuditEventSchema,
} from './schemas/eerr-audit-event.schema.js';
import { EerrAuditRepository } from './eerr-audit.repository.js';
import { PostCloseEditService } from './post-close-edit.service.js';
import { StructureController } from './structure.controller.js';
import { StructureService } from './structure.service.js';
import { StructureRepository } from './structure.repository.js';

@Module({
  imports: [
    BranchesPersistenceModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Eerr.name, schema: EerrSchema },
      { name: EerrAuditEventRecord.name, schema: EerrAuditEventSchema },
    ]),
  ],
  controllers: [
    AnalysisController,
    AnalyticsController,
    SalesGoalController,
    CompletePendingController,
    ImportController,
    ExportController,
    EerrController,
    StructureController,
    CloneController,
  ],
  providers: [
    AnalysisService,
    AnalyticsService,
    SalesGoalService,
    CompletePendingService,
    ImportService,
    ExportService,
    ImportToken,
    EerrService,
    EerrLifecycleService,
    EerrClock,
    StructureService,
    StructureRepository,
    EerrAuditRepository,
    PostCloseEditService,
    CloneService,
    ClonePreviewToken,
  ],
})
export class EerrModule {}

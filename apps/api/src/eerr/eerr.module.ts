import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesPersistenceModule } from '../branches/branches-persistence.module.js';
import { EerrController } from './eerr.controller.js';
import { EerrService } from './eerr.service.js';
import { Eerr, EerrSchema } from './schemas/eerr.schema.js';

@Module({
  imports: [
    BranchesPersistenceModule,
    MongooseModule.forFeature([{ name: Eerr.name, schema: EerrSchema }]),
  ],
  controllers: [EerrController],
  providers: [EerrService],
})
export class EerrModule {}

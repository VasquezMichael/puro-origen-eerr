import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { AnalysisService } from './analysis.service.js';

@Controller('eerr/:id')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get('analysis')
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analysis.get(id, request.user!);
  }
}

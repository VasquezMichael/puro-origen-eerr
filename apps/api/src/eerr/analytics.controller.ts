import { Controller, Get, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { EerrMonthDto } from './dto/eerr.dto.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(
    @Query() period: EerrMonthDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analytics.dashboard(period, request.user!);
  }
}

import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import {
  BranchComparisonDto,
  BranchParamDto,
  ComparisonPeriodsDto,
  EerrMonthDto,
} from './dto/eerr.dto.js';
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

  @Get('branches')
  branches(
    @Query() period: EerrMonthDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analytics.branchTable(period, request.user!);
  }

  @Get('branches/compare')
  compareBranches(
    @Query() query: BranchComparisonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analytics.twoBranches(
      query.branchId,
      query.referenceBranchId,
      query,
      request.user!,
    );
  }

  @Get('consolidated/compare')
  compareConsolidated(
    @Query() query: ComparisonPeriodsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analytics.consolidatedPeriods(
      query,
      { year: query.referenceYear, month: query.referenceMonth },
      request.user!,
    );
  }

  @Get('branches/:branchId/period-comparison')
  comparePeriods(
    @Param() params: BranchParamDto,
    @Query() query: ComparisonPeriodsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analytics.branchPeriods(
      params.branchId,
      query,
      { year: query.referenceYear, month: query.referenceMonth },
      request.user!,
    );
  }
}

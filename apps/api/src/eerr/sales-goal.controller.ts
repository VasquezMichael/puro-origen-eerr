import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { SalesGoalService } from './sales-goal.service.js';

@Controller('eerr/:id')
export class SalesGoalController {
  constructor(private readonly salesGoals: SalesGoalService) {}

  @Put('sales-goal')
  put(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.salesGoals.put(id, input, request.user!);
  }
}

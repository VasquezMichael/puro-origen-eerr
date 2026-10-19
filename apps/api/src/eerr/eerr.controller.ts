import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import {
  CreateEerrDto,
  EerrMonthDto,
  ListEerrDto,
  EerrTransitionDto,
} from './dto/eerr.dto.js';
import { EerrService } from './eerr.service.js';
import { EerrLifecycleService } from './eerr-lifecycle.service.js';

@Controller('eerr')
export class EerrController {
  constructor(
    private readonly eerr: EerrService,
    private readonly lifecycle: EerrLifecycleService,
  ) {}

  @Post(':id/close')
  close(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: EerrTransitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lifecycle.close(id, input.expectedRevision, request.user!);
  }

  @Post(':id/reopen')
  reopen(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: EerrTransitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lifecycle.reopen(id, input.expectedRevision, request.user!);
  }

  @Delete(':id')
  delete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: EerrTransitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lifecycle.delete(id, input.expectedRevision, request.user!);
  }

  @Post()
  create(@Body() input: CreateEerrDto, @Req() request: AuthenticatedRequest) {
    return this.eerr.create(input, request.user!);
  }

  @Get()
  list(@Query() input: ListEerrDto, @Req() request: AuthenticatedRequest) {
    return this.eerr.list(input.branchId, request.user!);
  }

  @Get('context')
  context(@Query() input: EerrMonthDto, @Req() request: AuthenticatedRequest) {
    return this.eerr.byMonth(input, request.user!);
  }

  @Get('capabilities')
  capabilities() {
    return this.lifecycle.capabilities();
  }

  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.eerr.get(id, request.user!);
  }
}

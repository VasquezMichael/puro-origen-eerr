import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { CreateEerrDto, EerrMonthDto, ListEerrDto } from './dto/eerr.dto.js';
import { EerrService } from './eerr.service.js';

@Controller('eerr')
export class EerrController {
  constructor(private readonly eerr: EerrService) {}

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

  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.eerr.get(id, request.user!);
  }
}

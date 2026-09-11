import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AdminOnly } from '../auth/auth.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { BranchesService } from './branches.service.js';
import {
  CreateBranchDto,
  UpdateBranchDto,
  BranchStatusDto,
} from './dto/branch.dto.js';
import { MongoIdPipe } from './mongo-id.pipe.js';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.branches.list(request.user!);
  }

  @Get(':id')
  get(
    @Param('id', MongoIdPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.branches.get(id, request.user!);
  }

  @AdminOnly()
  @Post()
  create(@Body() input: CreateBranchDto) {
    return this.branches.create(input);
  }

  @AdminOnly()
  @Patch(':id')
  update(@Param('id', MongoIdPipe) id: string, @Body() input: UpdateBranchDto) {
    return this.branches.update(id, input);
  }

  @AdminOnly()
  @Patch(':id/status')
  status(@Param('id', MongoIdPipe) id: string, @Body() input: BranchStatusDto) {
    return this.branches.setStatus(id, input.active);
  }
}

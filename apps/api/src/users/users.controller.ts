import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AdminOnly } from '../auth/auth.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UsersService } from './users.service.js';
import { AssignBranchAccessesDto } from './dto/assign-branch-accesses.dto.js';
import { MongoIdPipe } from '../branches/mongo-id.pipe.js';
import { UserStatusDto } from './dto/user-status.dto.js';

@AdminOnly()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() input: CreateUserDto) {
    return this.users.create(input);
  }

  @Patch(':id/password')
  resetPassword(@Param('id') id: string, @Body() input: ResetPasswordDto) {
    return this.users.resetPassword(
      id,
      input.password,
      input.requireChange ?? true,
    );
  }

  @Patch(':id/branch-accesses')
  assignBranchAccesses(
    @Param('id', MongoIdPipe) id: string,
    @Body() input: AssignBranchAccessesDto,
  ) {
    return this.users.assignBranchAccesses(id, input.branchAccesses);
  }

  @Patch(':id/status')
  status(
    @Param('id', MongoIdPipe) id: string,
    @Body() input: UserStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.setStatus(id, input.active, request.user!.sub);
  }
}

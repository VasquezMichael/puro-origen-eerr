import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { CloneService } from './clone.service.js';
import { ClonePreviewDto, CloneConfirmDto } from './dto/clone.dto.js';
const uuid = new ParseUUIDPipe({ version: '4' });
@Controller('eerr')
export class CloneController {
  constructor(private readonly clones: CloneService) {}
  @Get(':id/clone-sources') sources(
    @Param('id', uuid) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.clones.sources(id, req.user!);
  }
  @Post(':id/clone/preview') preview(
    @Param('id', uuid) id: string,
    @Body() input: ClonePreviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.clones.preview(id, input, req.user!);
  }
  @Post(':id/clone/confirm') confirm(
    @Param('id', uuid) id: string,
    @Body() input: CloneConfirmDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.clones.confirm(id, input, req.user!);
  }
}

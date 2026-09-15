import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import {
  AmountDto,
  CategoryConfirmDto,
  CategoryPreviewDto,
  ItemDto,
  RenameItemDto,
  RevisionDto,
} from './dto/structure.dto.js';
import { StructureService } from './structure.service.js';
const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('eerr/:id')
export class StructureController {
  constructor(private readonly structures: StructureService) {}
  @Get('structure')
  get(@Param('id', uuid) id: string, @Req() req: AuthenticatedRequest) {
    return this.structures.get(id, req.user!);
  }
  @Post('structure/initialize')
  initialize(
    @Param('id', uuid) id: string,
    @Body() input: RevisionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.initialize(id, input.expectedRevision, req.user!);
  }
  @Post('categories/preview')
  preview(
    @Param('id', uuid) id: string,
    @Body() input: CategoryPreviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.preview(id, input, req.user!);
  }
  @Post('categories/confirm')
  confirm(
    @Param('id', uuid) id: string,
    @Body() input: CategoryConfirmDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.confirm(id, input, req.user!);
  }
  @Post('items')
  createItem(
    @Param('id', uuid) id: string,
    @Body() input: ItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.createItem(id, input, req.user!);
  }
  @Patch('items/:nodeId')
  renameItem(
    @Param('id', uuid) id: string,
    @Param('nodeId', uuid) nodeId: string,
    @Body() input: RenameItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.renameItem(id, nodeId, input, req.user!);
  }
  @Put('items/:nodeId/amount')
  amount(
    @Param('id', uuid) id: string,
    @Param('nodeId', uuid) nodeId: string,
    @Body() input: AmountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.amount(id, nodeId, input, req.user!);
  }
}

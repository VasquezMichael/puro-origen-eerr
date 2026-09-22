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
  MoveItemDto,
  MoveCategoryDto,
  AmountDto,
  QuantityDto,
  ItemNoteDto,
  PeriodNoteDto,
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
  @Post('categories/move/preview')
  previewMove(
    @Param('id', uuid) id: string,
    @Body() input: MoveCategoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.previewMove(id, input, req.user!);
  }
  @Post('categories/move/confirm')
  confirmMove(
    @Param('id', uuid) id: string,
    @Body() input: CategoryConfirmDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.confirm(id, input, req.user!, 'MOVE');
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
  @Patch('items/:nodeId/move')
  moveItem(
    @Param('id', uuid) id: string,
    @Param('nodeId', uuid) nodeId: string,
    @Body() input: MoveItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.moveItem(id, nodeId, input, req.user!);
  }
  @Patch('items/:nodeId/archive')
  archive(
    @Param('id', uuid) id: string,
    @Param('nodeId', uuid) nodeId: string,
    @Body() input: RevisionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.changeArchive(
      id,
      nodeId,
      input.expectedRevision,
      false,
      req.user!,
    );
  }
  @Patch('items/:nodeId/restore')
  restore(
    @Param('id', uuid) id: string,
    @Param('nodeId', uuid) nodeId: string,
    @Body() input: RevisionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.changeArchive(
      id,
      nodeId,
      input.expectedRevision,
      true,
      req.user!,
    );
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
  @Put('items/:nodeId/quantity')
  quantity(
    @Param('id', uuid) id: string,
    @Param('nodeId', uuid) nodeId: string,
    @Body() input: QuantityDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.quantity(id, nodeId, input, req.user!);
  }
  @Put('items/:nodeId/note')
  itemNote(
    @Param('id', uuid) id: string,
    @Param('nodeId', uuid) nodeId: string,
    @Body() input: ItemNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.itemNote(id, nodeId, input, req.user!);
  }
  @Put('note')
  periodNote(
    @Param('id', uuid) id: string,
    @Body() input: PeriodNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.structures.periodNote(id, input, req.user!);
  }
}

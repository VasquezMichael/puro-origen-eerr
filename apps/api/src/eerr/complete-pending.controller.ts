import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { CompletePendingService } from './complete-pending.service.js';
class PreviewBody {}
class ConfirmBody {
  @IsString() @MinLength(1) @MaxLength(4096) previewToken!: string;
}
const uuid = new ParseUUIDPipe({ version: '4' });
@Controller('eerr/:id/amounts/complete-pending')
export class CompletePendingController {
  constructor(private readonly service: CompletePendingService) {}
  @Post('preview') preview(
    @Param('id', uuid) id: string,
    @Body() _body: PreviewBody,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.preview(id, req.user!);
  }
  @Post('confirm') confirm(
    @Param('id', uuid) id: string,
    @Body() body: ConfirmBody,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.confirm(id, body.previewToken, req.user!);
  }
}

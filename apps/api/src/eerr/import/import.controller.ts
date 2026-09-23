import {
  Controller,
  Get,
  Header,
  Post,
  Param,
  Query,
  Body,
  Req,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { IMPORT_LIMITS } from '@puro-origen/domain';
import type { AuthenticatedRequest } from '../../auth/auth.guard.js';
import { ImportService } from './import.service.js';
import { importMime, type ImportFile } from './import-file.js';
class TemplateQuery {
  @IsIn(['csv', 'xlsx']) format!: 'csv' | 'xlsx';
}
class EmptyUpload {}
class ConfirmUpload {
  @IsString() @MinLength(1) @MaxLength(4096) previewToken!: string;
}
const uuid = new ParseUUIDPipe({ version: '4' });
const upload = FileInterceptor('file', {
  limits: {
    fileSize: IMPORT_LIMITS.fileBytes,
    files: 1,
    fields: 1,
    fieldSize: 4096,
    parts: 2,
  },
});
@Controller('eerr/:id/import')
export class ImportController {
  constructor(private readonly imports: ImportService) {}
  @Get('template')
  @Header('Cache-Control', 'private, no-store')
  async template(
    @Param('id', uuid) id: string,
    @Query() query: TemplateQuery,
    @Req() req: AuthenticatedRequest,
  ) {
    const buffer = await this.imports.template(id, query.format, req.user!);
    return new StreamableFile(buffer, {
      type: importMime[query.format],
      disposition: `attachment; filename="eerr-${id}.${query.format}"`,
    });
  }
  @Post('preview')
  @UseInterceptors(upload)
  preview(
    @Param('id', uuid) id: string,
    @UploadedFile() file: ImportFile,
    @Body() _body: EmptyUpload,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.imports.preview(id, file, req.user!);
  }
  @Post('confirm')
  @UseInterceptors(upload)
  confirm(
    @Param('id', uuid) id: string,
    @UploadedFile() file: ImportFile,
    @Body() body: ConfirmUpload,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.imports.confirm(id, file, body.previewToken, req.user!);
  }
}

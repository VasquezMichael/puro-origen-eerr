import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth.guard.js';
import { ExportService } from './export.service.js';
import { XLSX_MIME } from './export-xlsx.js';

@Controller('eerr/:id/export')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get('xlsx')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async xlsx(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const { buffer, filename } = await this.exports.xlsx(id, request.user!);
    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${filename}"`,
    });
  }
}

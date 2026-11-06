import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ReportsService } from './reports.service';
import { CurrentUser, Permissions } from '../common/decorators/auth.decorators';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Post()
  @ApiBearerAuth()
  create(@CurrentUser('sub') userId: string, @Body() dto: { type: string; property_id?: string; message: string }) {
    return this.service.create(userId, dto);
  }

  @Get()
  @ApiBearerAuth()
  @Permissions('REPORT_MANAGE')
  list(@Query() q: PaginationDto) {
    return this.service.list(q.page, q.pageSize);
  }

  @Patch(':id/resolve')
  @ApiBearerAuth()
  @Permissions('REPORT_MANAGE')
  resolve(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.resolve(id, adminId);
  }
}

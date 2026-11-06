import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequestsService } from './requests.service';
import { CurrentUser, Permissions } from '../common/decorators/auth.decorators';

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Post()
  @ApiBearerAuth()
  create(@CurrentUser('sub') userId: string, @Body() dto: { property_id: string; message?: string; preferred_date?: string; preferred_time?: string }) {
    return this.service.create(userId, dto);
  }

  @Get()
  @ApiBearerAuth()
  mine(@CurrentUser('sub') userId: string, @Query('role') role?: string) {
    return this.service.myRequests(userId);
  }

  @Get(':id')
  @ApiBearerAuth()
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @Permissions('REQUEST_MANAGE')
  advance(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Body() dto: { status: string }) {
    return this.service.advance(id, adminId, dto.status);
  }
}

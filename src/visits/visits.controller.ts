import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { VisitsService } from './visits.service';
import { CurrentUser, Permissions } from '../common/decorators/auth.decorators';

@ApiTags('visits')
@Controller('visits')
export class VisitsController {
  constructor(private readonly service: VisitsService) {}

  @Post()
  @ApiBearerAuth()
  request(@CurrentUser('sub') userId: string, @Body() dto: { property_id: string; preferred_date?: string; preferred_time?: string }) {
    return this.service.request(userId, dto);
  }

  @Get()
  @ApiBearerAuth()
  mine(@CurrentUser('sub') userId: string) {
    return this.service.myVisits(userId);
  }

  @Get(':id')
  @ApiBearerAuth()
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id/schedule')
  @ApiBearerAuth()
  @Permissions('VISIT_MANAGE')
  schedule(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Body() dto: { date: string; time?: string; coordinator: string }) {
    return this.service.schedule(id, adminId, dto);
  }
}

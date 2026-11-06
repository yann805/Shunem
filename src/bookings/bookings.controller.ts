import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { BookingsService } from './bookings.service';
import { CurrentUser, Permissions } from '../common/decorators/auth.decorators';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Post()
  @ApiBearerAuth()
  create(@CurrentUser('sub') userId: string, @Body() dto: { property_id: string; start_date: string; end_date: string; occupants?: number }) {
    return this.service.create(userId, dto);
  }

  @Get()
  @ApiBearerAuth()
  mine(@CurrentUser('sub') userId: string) {
    return this.service.myBookings(userId);
  }

  @Get(':id')
  @ApiBearerAuth()
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id/confirm')
  @ApiBearerAuth()
  @Permissions('BOOKING_MANAGE')
  confirm(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.confirm(id, adminId);
  }
}

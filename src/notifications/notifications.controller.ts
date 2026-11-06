import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser('sub') userId: string, @Query() q: PaginationDto) {
    return this.service.list(userId, q.page, q.pageSize);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.markRead(id, userId);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.service.markAllRead(userId);
  }
}

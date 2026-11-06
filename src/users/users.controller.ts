import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { CurrentUser, Permissions } from '../common/decorators/auth.decorators';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser('sub') userId: string) {
    return this.service.getProfile(userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  update(@CurrentUser('sub') userId: string, @Body() dto: { display_name?: string; phone?: string; city?: string; language?: string }) {
    return this.service.updateProfile(userId, dto);
  }

  @Get('users')
  @ApiBearerAuth()
  @Permissions('SEEKER_VIEW', 'OWNER_VIEW')
  list(@Query() q: PaginationDto) {
    return this.service.list(q.page, q.pageSize);
  }
}

import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TermsService } from './terms.service';
import { CurrentUser, Permissions, Public } from '../common/decorators/auth.decorators';

@ApiTags('terms')
@Controller('terms')
export class TermsController {
  constructor(private readonly service: TermsService) {}

  @Get('active')
  @Public()
  active() {
    return this.service.active();
  }

  @Get()
  @ApiBearerAuth()
  @Permissions('TERMS_MANAGE')
  list() {
    return this.service.list();
  }

  @Post()
  @ApiBearerAuth()
  @Permissions('TERMS_MANAGE')
  publish(@CurrentUser('sub') adminId: string, @Body() dto: { version: string; sections: unknown[]; mandatory?: boolean }) {
    return this.service.publish(adminId, dto);
  }
}

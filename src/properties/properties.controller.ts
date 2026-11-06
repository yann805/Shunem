import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PropertiesService } from './properties.service';
import { CurrentUser, Permissions, Roles } from '../common/decorators/auth.decorators';
import { PropertyQueryDto, CreatePropertyDto } from './dto/property.dto';

@ApiTags('properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly service: PropertiesService) {}

  /** Paginated, filtered search (SRS §25, §92). Public. */
  @Get()
  @ApiOperation({ summary: 'Search properties (public, server-side filtered)' })
  search(@Query() q: PropertyQueryDto, @CurrentUser() user?: { sub: string; role: string }) {
    return this.service.search(q, user);
  }

  @Get('featured')
  featured(@CurrentUser() user?: { role: string }) {
    return this.service.featured(user);
  }

  @Get('recent')
  recent(@CurrentUser() user?: { role: string }) {
    return this.service.recent(user);
  }

  @Get('verified')
  verified(@CurrentUser() user?: { role: string }) {
    return this.service.verified(user);
  }

  @Get('locations/popular')
  popularLocations() {
    return this.service.popularLocations();
  }

  /** Property details (SRS §28). Public — admin-only location fields stripped. */
  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user?: { role: string }) {
    return this.service.getById(id, user);
  }

  // ---- Owner submission (SRS §47) ----
  @Post()
  @ApiBearerAuth()
  @Roles('owner', 'admin', 'super_admin')
  submit(@CurrentUser('sub') userId: string, @Body() dto: CreatePropertyDto) {
    return this.service.submit(userId, dto);
  }

  // ---- Admin verification / publish / suspend (SRS §23, §24, §47) ----
  @Patch(':id/verify')
  @ApiBearerAuth()
  @Permissions('PROPERTY_VERIFY')
  verify(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.verify(id, adminId);
  }

  @Patch(':id/reject')
  @ApiBearerAuth()
  @Permissions('PROPERTY_REJECT')
  reject(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.reject(id, adminId);
  }

  @Patch(':id/publish')
  @ApiBearerAuth()
  @Permissions('PROPERTY_VERIFY')
  publish(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.publish(id, adminId);
  }

  @Patch(':id/suspend')
  @ApiBearerAuth()
  @Permissions('PROPERTY_SUSPEND')
  suspend(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.suspend(id, adminId);
  }

  @Patch(':id/archive')
  @ApiBearerAuth()
  @Permissions('PROPERTY_VERIFY')
  archive(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.archive(id, adminId);
  }
}

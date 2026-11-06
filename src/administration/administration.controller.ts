import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdministrationService } from './administration.service';
import { CurrentUser, Permissions, Roles } from '../common/decorators/auth.decorators';

@ApiTags('administration')
@ApiBearerAuth()
@Controller('administration')
export class AdministrationController {
  constructor(private readonly service: AdministrationService) {}

  // ---- Owner applications (SRS §12, §45) — Admin ----
  @Get('owners')
  @Permissions('OWNER_VIEW')
  listOwnerApplications() {
    return this.service.listOwnerApplications();
  }

  @Patch('owners/:id/approve')
  @Permissions('OWNER_APPROVE')
  approveOwner(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.approveOwner(id, adminId);
  }

  @Patch('owners/:id/reject')
  @Permissions('OWNER_APPROVE')
  rejectOwner(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.rejectOwner(id, adminId);
  }

  @Patch('owners/:id/suspend')
  @Permissions('OWNER_SUSPEND')
  suspendOwner(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.suspendOwner(id, adminId);
  }

  // ---- Admin management (SRS §44) — Super Admin only ----
  @Get('admins')
  @Roles('super_admin')
  listAdmins() {
    return this.service.listAdmins();
  }

  @Post('admins')
  @Roles('super_admin')
  createAdmin(@CurrentUser('sub') adminId: string, @Body() dto: { email: string; display_name?: string; permissions?: string[] }) {
    return this.service.createAdmin(adminId, dto);
  }

  @Patch('admins/:id/permissions')
  @Roles('super_admin')
  updatePermissions(@CurrentUser('sub') adminId: string, @Param('id') id: string, @Body() dto: { permissions: string[] }) {
    return this.service.updatePermissions(adminId, id, dto.permissions);
  }

  @Patch('admins/:id/suspend')
  @Roles('super_admin')
  suspendAdmin(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.service.suspendAdmin(id, adminId);
  }
}

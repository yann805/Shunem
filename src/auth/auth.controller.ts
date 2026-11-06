import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import {
  GoogleAuthDto,
  RefreshDto,
  RoleDto,
  SeekerRegisterDto,
  OwnerApplicationDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Exchange a Google ID token for a backend session (SRS §78). */
  @Public()
  @Post('google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Google sign-in → backend session' })
  signInWithGoogle(@Body() dto: GoogleAuthDto) {
    return this.auth.signInWithGoogle(dto);
  }

  /** Restore the current user from a valid access token. */
  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  /** Refresh an expired access token (SRS §86). */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  /** Select/activate a role (SRS §9, §10). */
  @Post('role')
  @ApiBearerAuth()
  selectRole(@CurrentUser('sub') userId: string, @Body() dto: RoleDto) {
    return this.auth.selectRole(userId, dto);
  }

  /** Register a Property Seeker (SRS §9). */
  @Post('register/seeker')
  @ApiBearerAuth()
  registerSeeker(@CurrentUser('sub') userId: string, @Body() dto: SeekerRegisterDto) {
    return this.auth.registerSeeker(userId, dto);
  }

  /** Submit an Owner application (SRS §10, §11 — terms acceptance recorded). */
  @Post('register/owner')
  @ApiBearerAuth()
  submitOwnerApplication(@CurrentUser('sub') userId: string, @Body() dto: OwnerApplicationDto) {
    return this.auth.submitOwnerApplication(userId, dto);
  }

  /** Revoke the refresh token (logout). */
  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refresh_token);
  }
}

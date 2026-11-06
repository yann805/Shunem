import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token (from google_sign_in on the client)' })
  @IsString()
  @MinLength(10)
  id_token!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  refresh_token!: string;
}

export class RoleDto {
  @ApiProperty({ enum: ['seeker', 'owner'], description: 'Role to activate' })
  @IsEnum(['seeker', 'owner'] as const)
  role!: 'seeker' | 'owner';
}

export class SeekerRegisterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;
}

export class OwnerApplicationDto {
  @ApiProperty({ enum: ['individual', 'organization'] })
  @IsEnum(['individual', 'organization'] as const)
  type!: 'individual' | 'organization';

  @ApiProperty()
  @IsString()
  @MinLength(2)
  full_name!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty()
  @IsString()
  city!: string;

  @ApiProperty({ description: 'Owner Terms version accepted (e.g. v2.0)' })
  @IsString()
  accepted_terms_version!: string;
}

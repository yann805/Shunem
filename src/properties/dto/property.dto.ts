import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

enum TType { sale = 'sale', long_rent = 'long_rent', short_rent = 'short_rent', temporary = 'temporary', commercial_rent = 'commercial_rent' }
enum FType { furnished = 'furnished', unfurnished = 'unfurnished', semi_furnished = 'semi_furnished' }
enum Sort { relevance = 'relevance', newest = 'newest', priceAsc = 'priceAsc', priceDesc = 'priceDesc' }

/** Property search query (SRS §25, §26). Server-side filtering (SRS §92). */
export class PropertyQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: TType }) @IsOptional() @IsEnum(TType) transaction?: TType;
  @ApiPropertyOptional({ enum: FType }) @IsOptional() @IsEnum(FType) furnishing?: FType;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() min_price?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() max_price?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) min_beds?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) min_surface?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() amenities?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() verified?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() neighborhood?: string;
  @ApiPropertyOptional({ enum: Sort, default: 'relevance' }) @IsOptional() @IsEnum(Sort) sort?: Sort;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page_size?: number;
}

/** Owner-submitted property draft (SRS §47). Location includes admin-only
 *  fields — stored but never returned publicly (SRS §99). */
export class CreatePropertyDto {
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() category_id!: string;
  @ApiProperty() @IsString() type_name!: string;
  @ApiProperty({ enum: TType }) @IsEnum(TType) transaction_type!: TType;
  @ApiPropertyOptional({ enum: FType }) @IsOptional() @IsEnum(FType) furnishing_type?: FType;
  @ApiProperty() @Type(() => Number) @IsNumber() price!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() price_period?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() bedrooms?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() bathrooms?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() surface?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() land_area?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() parking?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() floors?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() amenity_ids?: string[];

  @ApiProperty() @IsString() country!: string;
  @ApiProperty() @IsString() city!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() neighborhood?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() street?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() quarter?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() landmark?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;

  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() media_urls?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() document_urls?: string[];
}

export class UpdateStatusDto {
  @ApiProperty() @IsString() status!: string;
}

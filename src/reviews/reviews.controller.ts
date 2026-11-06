import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ReviewsService } from './reviews.service';
import { CurrentUser } from '../common/decorators/auth.decorators';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Post()
  @ApiBearerAuth()
  create(@CurrentUser('sub') userId: string, @Body() dto: { property_id: string; rating: number; comment?: string }) {
    return this.service.create(userId, dto);
  }

  @Get('property/:propertyId')
  forProperty(@Param('propertyId') propertyId: string) {
    return this.service.forProperty(propertyId);
  }
}

import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PaymentsService } from './payments.service';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  /** Initiate a Mobile Money payment (client, SRS §146). */
  @Post()
  @ApiBearerAuth()
  initiate(@CurrentUser('sub') userId: string, @Body() dto: { booking_id: string; provider: string }) {
    return this.service.initiate(userId, dto);
  }

  /**
   * Provider webhook — the ONLY path that confirms a payment (SRS §146).
   * Public (called by MTN/Orange servers) but signature-verified at the edge
   * (API gateway) and idempotent here.
   */
  @Public()
  @Post('webhook')
  webhook(@Req() _req: Request, @Body() payload: Record<string, unknown>) {
    return this.service.handleWebhook(payload);
  }

  @Get(':id')
  @ApiBearerAuth()
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Get()
  @ApiBearerAuth()
  mine(@CurrentUser('sub') userId: string) {
    return this.service.myPayments(userId);
  }
}

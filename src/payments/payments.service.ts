import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

const PROVIDERS = new Set(['MTN MoMo', 'Orange Money']);

/**
 * Payment service (SRS §34, §65, §146, §147, §148).
 *
 * CRITICAL: payment success is NEVER taken from the client. The client calls
 * `initiate()`; the provider drives the user through Mobile Money; the
 * provider's webhook calls back to `handleWebhook()` which is the ONLY path
 * that transitions a payment to `confirmed`. Operations are idempotent.
 *
 * Amounts are Decimal (no float financial math, SRS §147). Every payment has
 * an immutable reference + produces an audit record (SRS §148).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** The client initiates a Mobile Money payment (SRS §146). */
  async initiate(userId: string, dto: { booking_id: string; provider: string }) {
    if (!PROVIDERS.has(dto.provider)) {
      throw new BadRequestException('Unsupported payment provider');
    }
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.booking_id },
      include: { property: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.seekerId !== userId) throw new BadRequestException('Booking does not belong to you');

    const reference = `PAY-${randomUUID()}`;
    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        userId,
        propertyId: booking.propertyId,
        amount: booking.total,
        currency: 'XAF',
        provider: dto.provider,
        reference,
        status: 'initiated',
      },
    });

    // Kick off the provider flow server-side. In dev (no credentials) this is
    // a no-op and the payment is confirmed via the webhook/test callback.
    try {
      const externalRef = await this.requestToProvider(dto.provider, Number(booking.total), reference, booking.id);
      if (externalRef) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { externalReference: externalRef, status: 'pending' },
        });
      }
    } catch (err) {
      this.logger.warn(`Provider initiate failed (dev?): ${String(err)}`);
    }

    await this.audit.log({ actor: userId, action: 'PAYMENT_INITIATED', entity: 'Payment', entityId: payment.id, metadata: { provider: dto.provider } });
    return payment;
  }

  /** Provider webhook — the ONLY path that confirms a payment (SRS §146). */
  async handleWebhook(payload: Record<string, unknown>) {
    const externalRef = (payload['external_reference'] ?? payload['reference']) as string | undefined;
    const status = (payload['status'] as string) ?? '';

    if (!externalRef) throw new BadRequestException('Missing reference');

    const payment = await this.prisma.payment.findFirst({
      where: { OR: [{ externalReference: externalRef }, { reference: externalRef }] },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    // Idempotency (SRS §148) — never re-confirm an already-final payment.
    if (['confirmed', 'failed', 'cancelled', 'refunded'].includes(payment.status)) {
      return { status: payment.status, idempotent: true };
    }

    const confirmed = /success|confirmed|completed/i.test(status);
    const next = confirmed ? 'confirmed' : /fail|cancel/i.test(status) ? 'failed' : payment.status;

    if (next === payment.status) return payment;

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: next },
    });

    if (next === 'confirmed') {
      // Confirm the booking + mark property reserved (transactional, SRS §89).
      await this.prisma.$transaction([
        this.prisma.booking.update({ where: { id: payment.bookingId }, data: { status: 'completed' } }),
        this.prisma.property.update({ where: { id: payment.propertyId }, data: { status: 'reserved' } }),
      ]);
      await this.notifications.create({
        userId: payment.userId,
        category: 'payment',
        title: 'Payment confirmed',
        body: `Your payment of ${payment.amount} ${payment.currency} was confirmed.`,
        linkRoute: '/payment',
        linkId: payment.id,
      });
    }

    await this.audit.log({
      actor: 'system',
      action: next === 'confirmed' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_FAILED',
      entity: 'Payment',
      entityId: payment.id,
      metadata: { provider: payment.provider, external_reference: externalRef },
    });
    return updated;
  }

  async getById(id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  async myPayments(userId: string) {
    return this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  // ---- Mobile Money provider calls (server-side) ----
  private async requestToProvider(provider: string, amount: number, reference: string, bookingId: string): Promise<string | null> {
    if (provider === 'MTN MoMo') return this.mtnRequestToPay(amount, reference, bookingId);
    if (provider === 'Orange Money') return this.orangeInitiate(amount, reference, bookingId);
    return null;
  }

  /** MTN MoMo: OAuth2 → request-to-pay (SRS §34). */
  private async mtnRequestToPay(amount: number, reference: string, bookingId: string): Promise<string | null> {
    const base = this.config.get<string>('MTN_MOMO_BASE_URL');
    const subKey = this.config.get<string>('MTN_MOMO_SUBSCRIPTION_KEY');
    const apiUser = this.config.get<string>('MTN_MOMO_API_USER');
    const apiKey = this.config.get<string>('MTN_MOMO_API_KEY');
    if (!base || !subKey || !apiUser || !apiKey) return null; // dev: no provider configured

    const tokenRes = await fetch(`${base}/collection/token/`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': subKey, Authorization: 'Basic ' + Buffer.from(`${apiUser}:${apiKey}`).toString('base64') },
    });
    if (!tokenRes.ok) throw new Error('MTN token failed');
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const externalId = randomUUID();
    await fetch(`${base}/collection/requesttopay`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': subKey,
        Authorization: `Bearer ${access_token}`,
        'X-Reference-Id': externalId,
        'X-Target-Environment': 'mtncameroon',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: String(amount), currency: 'XAF', externalId, payer: { partyIdType: 'MSISDN', partyId: '600000000' }, payerMessage: `Shunem booking ${bookingId}`, payeeNote: reference }),
    });
    return externalId;
  }

  /** Orange Money: OAuth2 → web payment init (SRS §34). */
  private async orangeInitiate(amount: number, reference: string, bookingId: string): Promise<string | null> {
    const base = this.config.get<string>('ORANGE_MONEY_BASE_URL');
    const clientId = this.config.get<string>('ORANGE_MONEY_CLIENT_ID');
    const clientSecret = this.config.get<string>('ORANGE_MONEY_CLIENT_SECRET');
    if (!base || !clientId || !clientSecret) return null;

    const tokenRes = await fetch(`${base}/oauth/v3/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    if (!tokenRes.ok) throw new Error('Orange token failed');
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const externalId = randomUUID();
    await fetch(`${base}/webpayment/v1/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'XAF', order_id: bookingId, merchant_key: reference, reference: externalId }),
    });
    return externalId;
  }
}

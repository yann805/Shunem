import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PropertiesModule } from './properties/properties.module';
import { CatalogModule } from './catalog/catalog.module';
import { RequestsModule } from './requests/requests.module';
import { VisitsModule } from './visits/visits.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TermsModule } from './terms/terms.module';
import { AuditModule } from './audit/audit.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AdministrationModule } from './administration/administration.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    CatalogModule,
    RequestsModule,
    VisitsModule,
    BookingsModule,
    PaymentsModule,
    NotificationsModule,
    TermsModule,
    AuditModule,
    ReportsModule,
    ReviewsModule,
    AdministrationModule,
  ],
  // Global guards (SRS §81 — zero-trust): every request is unauthenticated
  // until the JwtAuthGuard + RolesGuard + PermissionsGuard say otherwise.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

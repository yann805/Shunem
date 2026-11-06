import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);

  // Security headers (SRS §112)
  app.use(helmet());

  // CORS — only the configured origins (SRS §112)
  app.enableCors({
    origin: (config.get('CORS_ORIGIN') ?? '*').split(','),
    credentials: true,
  });

  // Global validation pipe — all input validated (SRS §82)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Structured errors — users never see SQLSTATE / stack traces (SRS §107)
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // API prefix + versioning (SRS §75, §76)
  app.setGlobalPrefix('api/v1', { exclude: ['payments/webhook'] });

  // OpenAPI docs (SRS §142)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Shunem API')
    .setDescription('Enterprise real-estate marketplace & intermediation platform')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  Logger.log(`🚀 Shunem API running on http://localhost:${port}/api/v1`, 'Bootstrap');
  Logger.log(`📘 Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
}
bootstrap();

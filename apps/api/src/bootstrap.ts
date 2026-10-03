import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from './config/env';
import { requestIdMiddleware } from './common/logging/request-id.middleware';
import { originSecretMiddleware } from './common/guards/origin-secret.middleware';

/** Shared HTTP setup for main.ts and integration tests. */
export function configureApp(app: INestApplication, config: AppConfig) {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: config.isProd ? undefined : false, // Swagger UI needs inline scripts in dev
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(originSecretMiddleware(config.originSecret));
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.enableCors({ origin: [config.appUrl], credentials: true });
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'health', method: RequestMethod.GET }, { path: 'health/live', method: RequestMethod.GET }] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Accountability API')
        .setDescription(
          'REST API for the Accountability MVP. Auth: httpOnly session cookie `acc_session` (set by /auth/login). ' +
            'Mutating requests from browsers must send `X-Requested-With: accountability-web`. ' +
            'Responses: `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`.',
        )
        .setVersion('1.0')
        .addCookieAuth('acc_session')
        .build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }
}

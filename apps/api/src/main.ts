import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { APP_CONFIG, AppConfig } from './config/env';
import { JsonLogger, log } from './common/logging/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger(), bodyParser: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  await app.listen(config.port);
  log.info('api_started', { port: config.port, env: config.nodeEnv, jobs: config.jobsEnabled });
}

bootstrap().catch((e) => {
  log.error('api_failed_to_start', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});

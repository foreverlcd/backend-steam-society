import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const webOrigins = configService
    .get<string>('WEB_ORIGIN')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({ origin: webOrigins?.length ? webOrigins : false });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

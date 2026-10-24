import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseWebOrigins } from './shared/config/web-origins.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const webOrigins = parseWebOrigins(configService.get<string>('WEB_ORIGIN'));

  app.enableCors({ origin: webOrigins.length > 0 ? webOrigins : false });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

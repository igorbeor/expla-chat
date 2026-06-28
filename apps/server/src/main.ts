import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { CorsIoAdapter } from './app/adapters/cors-io.adapter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useWebSocketAdapter(
    new CorsIoAdapter(app, config.get<string>('CLIENT_ORIGIN', 'http://localhost:4200')),
  );

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();

import { Module } from '@nestjs/common';
import { ChatModule } from './modules/chat/chat.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BotsModule } from './modules/bots/bots.module';
import { validate } from './config/env.validation';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ChatModule,
    BotsModule,
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate }),
  ],
})
export class AppModule {}

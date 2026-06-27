import { Module } from '@nestjs/common';
import { ChatModule } from './modules/chat/chat.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BotsModule } from './modules/bots/bots.module';

@Module({
  imports: [ChatModule, BotsModule, EventEmitterModule.forRoot()],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BotsModule } from './bots/bots.module';

@Module({
  imports: [ChatModule, BotsModule, EventEmitterModule.forRoot()],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';

@Module({
  providers: [ChatGateway],
  imports: [MessagesModule, UsersModule]
})
export class ChatModule {}

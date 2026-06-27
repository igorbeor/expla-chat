import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { UsersModule } from '../users/users.module';

@Module({
  providers: [MessagesService],
  imports: [UsersModule],
  exports: [MessagesService]
})
export class MessagesModule {}

import { Module } from '@nestjs/common';
import { BotsService } from './bots.service';
import { UsersModule } from '../users/users.module';

@Module({
  providers: [BotsService],
  imports: [UsersModule]
})
export class BotsModule {}

import { Module } from '@nestjs/common';
import { BotsService } from './bots.service';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';

@Module({
  providers: [BotsService, UsersService],
  imports: [UsersModule]
})
export class BotsModule {}

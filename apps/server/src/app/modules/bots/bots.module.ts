import { Module } from '@nestjs/common';
import { BotsService } from './bots.service';
import { UsersModule } from '../users/users.module';
import { BotsRegistryService } from './bots.registry.service';
import { EchoBotStrategyService } from './strategies/echo.bot-strategy.service';
import { ReverseBotStrategyService } from './strategies/reverse.bot-strategy.service';
import { SpamBotStrategyService } from './strategies/spam.bot-strategy.service';
import { IgnoreBotStrategyService } from './strategies/ignore.bot-strategy.service';

@Module({
  providers: [
    BotsService,
    BotsRegistryService,
    EchoBotStrategyService,
    ReverseBotStrategyService,
    SpamBotStrategyService,
    IgnoreBotStrategyService,
  ],
  imports: [UsersModule],
})
export class BotsModule {}
